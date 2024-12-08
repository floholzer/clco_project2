const pulumi = require("@pulumi/pulumi");
const azure_native = require("@pulumi/azure-native");
const azuread = require("@pulumi/azuread");

// Konfigurationsvariablen
const resourceGroupName = "clco_project2";
const location = "northeurope";
const size = "Standard_B1s";
const adminUsername = "azureuser";
const adminPassword = "Password1234!";
const diskSize = 1024;
const ownerSubscriptionID = "baf14dc0-aa90-480a-a428-038a6943c5b3";
const loadBalancerName = "loadBalancer";
const FE_IP_NAME = "FrontendIPConfig";
const BE_POOLS_NAME = "BackEndPools";
const VM_COUNT = 2; // set vm count - horizontally scalable
const teamMembers = [
    {
        name: "Holzer",
        email: "wi22b090@technikum-wien.at",
    },
    {
        name: "Dziekan",
        email: "wi22b004@technikum-wien.at",
    }
];

// Resource Group erstellen
const resourceGroup = new azure_native.resources.ResourceGroup(resourceGroupName, {
    location: location,
});

// Availability Set erstellen (Verfügbarkeit und Redundanz von VMs gewährleisten, die durch den Load Balancer verwaltet werden)
const availabilitySet = new azure_native.compute.AvailabilitySet("vm-availability-set", {
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    platformFaultDomainCount: 2,
    platformUpdateDomainCount: 2,
    sku: {
        name: "Aligned",
    },
});

// Speicherkonto für Boot-Diagnose erstellen
const storageAccount = new azure_native.storage.StorageAccount("sa", {
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    sku: {name: azure_native.storage.SkuName.Standard_LRS},
    kind: azure_native.storage.Kind.StorageV2,
});

// Virtuelles Netzwerk erstellen
const vnet = new azure_native.network.VirtualNetwork("vnet", {
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    addressSpace: {addressPrefixes: ["10.0.0.0/16"]},
});

// Network Security Group (NSG) erstellen
const nsg = new azure_native.network.NetworkSecurityGroup("vnet-nsg", {
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
});

// Subnetz erstellen und NSG direkt verknüpfen
const subnet = new azure_native.network.Subnet("Subnet", {
    resourceGroupName: resourceGroup.name,
    virtualNetworkName: vnet.name,
    addressPrefix: "10.0.1.0/24", // Erstes Subnetz
    networkSecurityGroup: {
        id: nsg.id, // Verknüpfe das NSG direkt
    },
});

// Inbound-Regel für Port 80 in der NSG erstellen
const allowHttpRule = new azure_native.network.SecurityRule("allow-http", {
    resourceGroupName: resourceGroup.name,
    networkSecurityGroupName: nsg.name,
    priority: 100,
    direction: azure_native.network.SecurityRuleDirection.Inbound,
    access: azure_native.network.SecurityRuleAccess.Allow,
    protocol: "*",
    sourcePortRange: "*",
    destinationPortRange: "80",
    sourceAddressPrefix: "*",
    destinationAddressPrefix: "*",
});

// Öffentliche IP-Adresse für das Netzwerk erstellen
const publicIp = new azure_native.network.PublicIPAddress("public-ip", {
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    publicIPAllocationMethod: azure_native.network.IpAllocationMethod.Static,
    sku: {name: azure_native.network.PublicIPAddressSkuName.Standard},
});

// Load Balancer erstellen
const loadBalancer = new azure_native.network.LoadBalancer(loadBalancerName, {
    loadBalancerName: loadBalancerName,
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    sku: {name: azure_native.network.LoadBalancerSkuName.Standard},
    frontendIPConfigurations: [{
        name: FE_IP_NAME,
        publicIPAddress: {id: publicIp.id},
    }],
    backendAddressPools: [{
        name: BE_POOLS_NAME,
    }],
    probes: [{
        intervalInSeconds: 15,
        name: "probe-lb",
        numberOfProbes: 2,
        port: 80,
        probeThreshold: 1,
        protocol: azure_native.network.ProbeProtocol.Http,
        requestPath: "/",
    }],
    loadBalancingRules: [{
        backendPort: 80,
        enableFloatingIP: false,
        frontendPort: 80,
        idleTimeoutInMinutes: 5,
        loadDistribution: azure_native.network.LoadDistribution.Default,
        protocol: azure_native.network.TransportProtocol.Tcp,
        name: "rulelb",
        backendAddressPool: {
            id: pulumi.interpolate`/subscriptions/${ownerSubscriptionID}/resourceGroups/${resourceGroup.name}/providers/Microsoft.Network/loadBalancers/${loadBalancerName}/backendAddressPools/${BE_POOLS_NAME}`,
        },
        frontendIPConfiguration: {
            id: pulumi.interpolate`/subscriptions/${ownerSubscriptionID}/resourceGroups/${resourceGroup.name}/providers/Microsoft.Network/loadBalancers/${loadBalancerName}/frontendIPConfigurations/${FE_IP_NAME}`,
        },
        probe: {
            id: pulumi.interpolate`/subscriptions/${ownerSubscriptionID}/resourceGroups/${resourceGroup.name}/providers/Microsoft.Network/loadBalancers/${loadBalancerName}/probes/probe-lb`,
        },
    }],
});

// Default-Regel zum Verweigern von allem anderen erstellen
const denyAllRule = new azure_native.network.SecurityRule("deny-all", {
    resourceGroupName: resourceGroup.name,
    networkSecurityGroupName: nsg.name,
    priority: 200,
    direction: "Inbound",
    access: "Deny",
    protocol: "*",
    sourcePortRange: "*",
    destinationPortRange: "*",
    sourceAddressPrefix: "*",
    destinationAddressPrefix: "*",
});

// Funktion zur Erstellung einer VM mit einer eigenen NIC + Disk
function createVmAndNicWithDisk(index) {
    // NIC erstellen
    const nic = new azure_native.network.NetworkInterface("nic-" + index, {
        resourceGroupName: resourceGroup.name,
        location: resourceGroup.location,
        ipConfigurations: [{
            name: "ipconfig-" + index,
            subnet: {id: subnet.id}, // Verknüpfung mit dem Subnetz
            privateIPAllocationMethod: "Dynamic",
            loadBalancerBackendAddressPools: [{
                id: pulumi.interpolate`${loadBalancer.id}/backendAddressPools/${BE_POOLS_NAME}`,
            }],
        }],
        networkSecurityGroup: {id: nsg.id}, // Verknüpfung mit dem NSG
    });

    // Disk erstellen
    const disk = new azure_native.compute.Disk("disk-" + index, {
        resourceGroupName: resourceGroup.name,
        location: resourceGroup.location,
        diskSizeGB: diskSize,
        sku: {name: azure_native.compute.StorageAccountTypes.Premium_LRS},
        creationData: {createOption: azure_native.compute.DiskCreateOption.Empty},
    });

    // VM erstellen und Disk anhängen
    const vm = new azure_native.compute.VirtualMachine("vm-" + index, {
        resourceGroupName: resourceGroup.name,
        location: resourceGroup.location,
        availabilitySet: {
            id: availabilitySet.id, // Verknüpfe mit dem Availability Set
        },
        hardwareProfile: {
            vmSize: size,
        },
        osProfile: {
            adminUsername: adminUsername,
            adminPassword: adminPassword,
            computerName: "vm-" + index,
            customData: Buffer.from("#!/bin/bash\nsudo apt-get update && sudo apt-get install -y nginx && echo '<head><title>VM " + index + "</title></head><body><h1>Hello world!</h1></body>' > /var/www/html/index.html && sudo systemctl start nginx").toString("base64"),
        },
        storageProfile: {
            osDisk: {
                createOption: "FromImage",
                managedDisk: {
                    storageAccountType: "Standard_LRS",
                },
            },
            imageReference: {
                publisher: "Canonical",
                offer: "0001-com-ubuntu-server-jammy",
                sku: "22_04-lts",
                version: "latest",
            },
            dataDisks: [{
                lun: 0,
                createOption: "Attach",
                managedDisk: {id: disk.id},
            }],
        },
        networkProfile: {
            networkInterfaces: [{id: nic.id}],
        },
        diagnosticsProfile: {
            bootDiagnostics: {
                enabled: true,
                storageUri: storageAccount.primaryEndpoints.apply(ep => ep.blob),
            },
        },
    });

    return {nic, disk, vm};
}

// Metric Alert für CPU-Auslastung für beide VMs hinzufügen
function createMetricAlert(vm, index) {
    return new azure_native.insights.MetricAlert("vmCpuUsageAlert-" + index, {
        resourceGroupName: resourceGroup.name,
        location: "global", // Globale Alert-Regel erforderlich
        severity: 3,
        windowSize: "PT30M", // 30-Minuten Intervall
        evaluationFrequency: "PT1M", // Evaluierung alle Minute
        enabled: true,
        scopes: [vm.vm.id],
        criteria: {
            odataType: "Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria", // Globale Kriterien
            allOf: [{
                name: "HighCpuUsage-VM-" + index,
                metricNamespace: "Microsoft.Compute/virtualMachines", // Namespace für VM-Metriken
                metricName: "Percentage CPU", // CPU-Auslastung
                operator: azure_native.insights.ConditionOperator.GreaterThan, // Schwellenwert-Regel
                threshold: 80, // 80% CPU-Nutzung
                timeAggregation: azure_native.insights.AggregationTypeEnum.Maximum, // Maximalwert
                criterionType: "StaticThresholdCriterion", // Statische Schwelle
            }],
        },
        autoMitigate: true,
        description: "Alert rule for CPU usage above 80% on monitored Linux VM " + index + ".",
    });
}

// VMs erstellen und Metrik-Alarme hinzufügen
for (let i = 0; i < VM_COUNT; i++) {
    const vm = createVmAndNicWithDisk(i);
    createMetricAlert(vm, i);
}

// Create Role Assignments for Team Members

// Iterate over team members to create Role Assignments and Action Groups
teamMembers.forEach((member, index) => {
    // Retrieve user details asynchronously
    const user = azuread.getUser({
        userPrincipalName: member.email,
    });

    // Use Pulumi's apply function to handle the asynchronous retrieval
    user.then(userData => {
        const ownerRoleDefinitionId = "/subscriptions/"+ownerSubscriptionID+"/providers/Microsoft.Authorization/roleDefinitions/8e3af657-a8ff-443c-a75c-2fe8c4bcb635";

        // Create Role Assignment
        const roleAssignment = new azure_native.authorization.RoleAssignment("owner-role-assignment-"+index, {
            principalId: userData.objectId,
            principalType: azure_native.authorization.PrincipalType.User,
            roleDefinitionId: ownerRoleDefinitionId,
            scope: resourceGroup.id,
            roleAssignmentName: "6f584535-d195-4368-aa15-aa27a3a40f3"+index, // just a random GUID
        });

        // Create Action Group for the team member
        const actionGroup = new azure_native.insights.ActionGroup("action-group-"+index, {
            location: "global",
            resourceGroupName: resourceGroup.name,
            actionGroupName: pulumi.interpolate`${resourceGroup.name}-action-group-${index}`,
            groupShortName: "group-short",
            enabled: true,
            emailReceivers: [{
                name: member.name,
                emailAddress: member.email,
            }],
        });
    });
});


// Outputs
exports.resourceGroupName = resourceGroup.name;
exports.vnetName = vnet.name;
exports.subnetName = subnet.name;
exports.nsgName = nsg.name;
exports.loadBalancerName = loadBalancer.name;
exports.publicIp = publicIp.ipAddress;