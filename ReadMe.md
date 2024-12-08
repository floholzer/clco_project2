# Azure VM Deployment with Pulumi

This project automates the deployment of Virtual Machines (VMs) in Azure using Pulumi. It includes the creation of Network Interfaces (NICs), Disks, and Metric Alerts for monitoring CPU usage. Additionally, it sets up Role-Based Access Control (RBAC) for team members and creates Action Groups for alert notifications.

## Prerequisites

- Node.js and npm installed
- Pulumi CLI installed
- Azure CLI installed
- Azure account with appropriate permissions

## Setup

1. Clone the repository:
    ```sh
    git clone https://github.com/floholzer/clco_project2.git
    cd clco_project2
    ```

2. Install dependencies:
    ```sh
    npm install
    ```

3. Login to Azure:
    ```sh
    az login
    ```

4. Configure Pulumi:
    ```sh
    pulumi login
    ```

## Deployment

1. Initialize Pulumi stack:
    ```sh
    pulumi stack init <stack-name>
    ```

2. Set configuration values: Defined in index.js file.

3. Deploy the stack:
    ```sh
    pulumi up
    ```

## Outputs

After deployment, the following outputs will be available:

- `resourceGroupName`: Name of the resource group
- `vnetName`: Name of the virtual network
- `subnetName`: Name of the subnet
- `nsgName`: Name of the network security group
- `loadBalancerName`: Name of the load balancer
- `publicIp`: Public IP address of the load balancer

## Cleanup

To destroy the resources created by Pulumi, run:
```sh
pulumi destroy
```

## Notes

Retrieve the Azure subscription ID by running:
```sh
az role assignment list --assignee "your-email" --output json 
```