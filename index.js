const pulumi = require("@pulumi/pulumi");
const azure_native = require("@pulumi/azure-native");

// Konfigurationsvariablen
const resourceGroupName = "A12_Monitoring";
const location = "westeurope";
const vmName = "monitored-linux-vm";
const size = "Standard_B1s";
const adminUsername = "azureuser";
const adminPassword = "Password1234!";

// Resource Group erstellen
const resourceGroup = new azure_native.resources.ResourceGroup(resourceGroupName, {
    location: location,
});

// Speicherkonto für Boot-Diagnose erstellen
const storageAccount = new azure_native.storage.StorageAccount("sa", {
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    sku: { name: "Standard_LRS" },
    kind: "StorageV2",
});

// Virtuelles Netzwerk erstellen
const vnet = new azure_native.network.VirtualNetwork("vnet", {
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    addressSpace: { addressPrefixes: ["10.0.0.0/16"] },
});

// Subnetz erstellen
const subnet = new azure_native.network.Subnet("subnet", {
    resourceGroupName: resourceGroup.name,
    virtualNetworkName: vnet.name,
    addressPrefix: "10.0.1.0/24",
});

// Funktion zur Erstellung einer VM mit einer eigenen NIC
function createVmAndNicWithDisk(index) {
    // NIC erstellen
    const nic = new azure_native.network.NetworkInterface(`nic-${index}`, {
        resourceGroupName: resourceGroup.name,
        location: resourceGroup.location,
        ipConfigurations: [{
            name: `ipconfig-${index}`,
            subnet: { id: subnet.id },
            privateIPAllocationMethod: "Dynamic",
        }],
    });
    
    // Disk erstellen
    const disk = new azure_native.compute.Disk(`disk-${index}`, {
        resourceGroupName: resourceGroup.name,
        location: resourceGroup.location,
        diskSizeGB: diskSize,
        sku: { name: "Premium_LRS" },
        creationData: { createOption: "Empty" }, // Leere Disk erstellen
    });
    
    // VM erstellen
    const vm = new azure_native.compute.VirtualMachine(`${vmBaseName}-${index}`, {
        resourceGroupName: resourceGroup.name,
        location: resourceGroup.location,
        hardwareProfile: {
            vmSize: size,
        },
        osProfile: {
            adminUsername: adminUsername,
            adminPassword: adminPassword,
            computerName: `${vmBaseName}-${index}`,
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
                offer: "UbuntuServer",
                sku: "18.04-LTS",
                version: "latest",
            },
            dataDisks: [{
                lun: 0, // Logical Unit Number
                createOption: "Attach",
                managedDisk: { id: disk.id },
            }],
        },
        networkProfile: {
            networkInterfaces: [{ id: nic.id }],
        },
        diagnosticsProfile: {
            bootDiagnostics: {
                enabled: true,
                storageUri: storageAccount.primaryEndpoints.apply(ep => ep.blob),
            },
        },
    });

    return { nic, vm };
}

// Zwei VMs und NICs erstellen
const vm1 = createVmAndNicWithDisk(1);
const vm2 = createVmAndNicWithDisk(2);

// Metric Alert für CPU-Auslastung für beide VMs hinzufügen
function createMetricAlert(vm, index) {
    return new azure_native.insights.MetricAlert(`vmCpuUsageAlert-${index}`, {
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
                name: `HighCpuUsage-${index}`,
                metricNamespace: "Microsoft.Compute/virtualMachines", // Namespace für VM-Metriken
                metricName: "Percentage CPU", // CPU-Auslastung
                operator: "GreaterThan", // Schwellenwert-Regel
                threshold: 80, // 80% CPU-Nutzung
                timeAggregation: "Maximum", // Maximalwert
                criterionType: "StaticThresholdCriterion", // Statische Schwelle
            }],
        },
        autoMitigate: true,
        description: `Alert rule for CPU usage above 80% on monitored Linux VM ${index}.`,
    });
}

const alert1 = createMetricAlert(vm1, 1);
const alert2 = createMetricAlert(vm2, 2);

// Outputs
exports.resourceGroupName = resourceGroup.name;
exports.vnetName = vnet.name;
exports.subnetName = subnet.name;
exports.vm1Name = vm1.vm.name;
exports.vm2Name = vm2.vm.name;
exports.vm1DiskId = vm1.disk.id;
exports.vm2DiskId = vm2.disk.id;