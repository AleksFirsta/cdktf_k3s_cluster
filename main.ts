import { Construct } from "constructs";
import { App, TerraformOutput, TerraformStack, TerraformVariable } from "cdktf";
import { Vpc } from "@cdktf/provider-aws/lib/vpc";
import { AwsProvider, AwsProviderDefaultTags } from "@cdktf/provider-aws/lib/provider";
import { Subnet } from "@cdktf/provider-aws/lib/subnet";
import { InternetGateway } from "@cdktf/provider-aws/lib/internet-gateway";
import { Eip } from "@cdktf/provider-aws/lib/eip";
import { NatGateway } from "@cdktf/provider-aws/lib/nat-gateway";
import { RouteTable } from "@cdktf/provider-aws/lib/route-table";
import { RouteTableAssociation } from "@cdktf/provider-aws/lib/route-table-association";
import { SecurityGroup } from "@cdktf/provider-aws/lib/security-group";
import { KeyPair } from "@cdktf/provider-aws/lib/key-pair";
import { Instance } from "@cdktf/provider-aws/lib/instance";
import { DataAwsAmi } from "@cdktf/provider-aws/lib/data-aws-ami";

class MyStack extends TerraformStack {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    const cidrSubnet = (baseCidr: string, additionalBits: number, subnetNum: number): string =>
      `\${cidrsubnet(${baseCidr}, ${additionalBits}, ${subnetNum})}`;

    const aws_region = new TerraformVariable(this, "aws_region", {
      default: "eu-north-1",
      type: "string",
    });

    const aws_profile = new TerraformVariable(this, "aws_profile", {
      type: "string",
      sensitive: true,
      default: "aleks",
    });

    const aws_default_tags: AwsProviderDefaultTags = {
      tags: {
        project: "k3s",
        owner: "grigorenko",
      },
    };

    new AwsProvider(this, "aws_provider", {
      profile: aws_profile.stringValue,
      region: aws_region.stringValue,
      defaultTags: [aws_default_tags],
    });

    const aws_vpc= new Vpc(this, "k3s_cluster_vpc", {
      cidrBlock: "172.16.0.0/16",
      enableDnsHostnames: true,
      enableDnsSupport: true,
      tags: {
        project: "k3s",
      },
    });

    const aws_private_subnet = new Subnet(this,"k3s_private_subnet",{
      vpcId:aws_vpc.id,
      cidrBlock:cidrSubnet(aws_vpc.cidrBlock,8,3),
      availabilityZone:aws_region+"a"
    }
    )
    const aws_public_subnet = new Subnet(this,"k3s_public_subnet",{
      vpcId:aws_vpc.id,
      cidrBlock: cidrSubnet(aws_vpc.cidrBlock,8,2),
      availabilityZone: aws_region+"b",
      mapPublicIpOnLaunch: true
    })

    const aws_internet_gateway_gw= new InternetGateway(this,"gw",{
      vpcId:aws_vpc.id,
    tags:{
      cluster:"k3s internet gateway"
    }
    })

    const aws_eip_nat = new Eip(this,"aws_eip_nat",{
      domain:"vpc"
    })

    const aws_nat_gateway_main = new NatGateway(this,"main",{
      allocationId: aws_eip_nat.id,
      subnetId:aws_public_subnet.id,
      dependsOn: [aws_internet_gateway_gw]
    })

    const aws_route_table_public = new RouteTable(this,"public",{
      vpcId:aws_vpc.id,
      route:[
        {
          cidrBlock:"0.0.0.0/0",
          gatewayId:aws_internet_gateway_gw.id
        }
      ]
    })
    const aws_route_table_private = new RouteTable(this,"private",{
      vpcId:aws_vpc.id,
      route:[{
        cidrBlock: "0.0.0.0/0",
        gatewayId:aws_nat_gateway_main.id
      }]
    })

    new RouteTableAssociation(this,"aws_rt_assoc_public",{
      subnetId:aws_public_subnet.id,
      routeTableId:aws_route_table_public.id
    })
    new RouteTableAssociation(this,"aws_rt_assoc_private",{
      subnetId:aws_private_subnet.id,
      routeTableId:aws_route_table_private.id
    })

    const aws_sg_k3s = new SecurityGroup(this,"aws_sg_k3s",{
      name: "k3s security group",
      vpcId:aws_vpc.id,
      ingress:[
        {
        fromPort:0,
        toPort:0,
        protocol:"-1",
        cidrBlocks:["0.0.0.0/16"],
      },
      {
        fromPort:22,
        toPort:22,
        protocol:"tcp",
        cidrBlocks:["0.0.0.0/0"]
      }],
      egress:[
        {
          fromPort:0,
          toPort:0,
          protocol:"-1",
          cidrBlocks:["0.0.0.0/0"]
        }
      ]
    })

    const aws_key_pair = new KeyPair(this,"key_pair",{
      keyName: "key_pair_wsl",
      publicKey: "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAACAQCz58/wpH+msEVcwxkabZ7p1QOYgFvjH/+oT9/KNbiraj+RiXdQt2kPCI0Y7ISabkEfdk09tgQ4HkOpUdgsNKB7tBb67F8Q7cnnwvVYkKAoPHlB/hDo7p6DTQLrNXG6mnVaBTN4YyDAfnl3fmkAo7NrhMVVzj447Mb+IcVG0NODTWqF959EjYaryPI7yCKgza4EU2IrVQ/4QnEWY7ThkoIaP43cBFTAnchwQNj3y8ZtvSCqhmnSXkPWelYDK7iA3RayKbEhcOHkkp+yRrnQ9b6/uNdDYdNgxcXS0CSExtBbaaszkW8UUL5b+XJIM+AcQK74+TIJQ8Iei3b07lXv/I42rF/RZuX/DOeFOb7M+8NYtxYIyxC9icV/+XcumjptcpCHQLOMKM+uFZMOzIQo8ofXCXGr1BqURT3DSat4087dDxbGD/bWl1Q6/2kkW88BGv9bnZVYpVCR47AztnDpNs4QlemjUl7wJ1AnwA6YZPMpPoXQ9GIeMbcz5X0lSD8kAEfZi1LKTZH4WNXAUU+pWzJgC3BBD1udOAt/OVZZ1XbwH3n7Wzfbijt0eBlRV16iIlmu5t3Ow4o+UfgHhJ8xVyJM1NUXWkqfykbJNhDJilhQLSInF/VLguNE5UO4YhjG0EVZenNkHBIhQoI0XK143oM2f0oWFHVz8J8D78cCZk8/Fw==",
    })

    const ubuntuAmi = new DataAwsAmi(this, "Ubuntu2404Ami", {
      mostRecent: true,
      owners: ["099720109477"],
      filter:[
        {name:"name",
        values:["*ubuntu-noble-24.04-amd64-server-*"]},
        {
          name:"architecture",
          values:["x86_64"]
        },
        {
          name: "virtualization-type",
          values: ["hvm"],
        },
      ]
      
    });

    const aws_nginx = new Instance(this,"nginx",{
      ami: ubuntuAmi.id,
      instanceType:"t3.micro",
      subnetId: aws_public_subnet.id,
      keyName: aws_key_pair.id,
      associatePublicIpAddress: true,
      vpcSecurityGroupIds: [aws_sg_k3s.id],
      userData: `#!/bin/bash
      apt-get update
      apt-get install -y nginx
      # Create a simple HTML page
      cat > /var/www/html/index.html <<'EOL'
      <!DOCTYPE html>
      <html>
      <head>
      <title>Welcome to K3s Cluster Orchestration</title>
      <style>
                      body {
                          font-family: Arial, sans-serif;
                          margin: 40px auto;
                          max-width: 650px;
                          line-height: 1.6;
                          padding: 0 10px;
                      }
                  </style>
              </head>
              <body>
                  <h1>Welcome to K3s Cluster Orchestration</h1>
                  <h1>AWS Infrastructure Automation with Terraform Blueprint</h1>
              </body>
              </html>
              EOL

              # Configure NGINX
              cat > /etc/nginx/sites-available/default <<'EOL'
              server {
                  listen 80 default_server;
                  listen [::]:80 default_server;

                  root /var/www/html;
                  index index.html index.htm;

                  server_name _;

                  location / {
                      try_files $uri $uri/ =404;
                  }
              }
              EOL

              systemctl restart nginx
      `,
      dependsOn:[aws_internet_gateway_gw]
    })
    const k3s_master = new Instance(this,"k3s_master",{
      ami: ubuntuAmi.id,
      instanceType:"t3.micro",
      subnetId: aws_private_subnet.id,
      keyName: aws_key_pair.id,
      vpcSecurityGroupIds:[aws_sg_k3s.id],
      userData:`#!/bin/bash
      apt-get update
              apt-get install -y curl
              curl -sfL https://get.k3s.io | sh -
      `,
      dependsOn:[aws_nat_gateway_main]
    })
    const k3s_count = new TerraformVariable(this,"k3s_count",{
      default:2,
      type: "number"
    })
    new Instance(this,"k3s_workers",{
      count: k3s_count.numberValue,
      ami: ubuntuAmi.id,
      instanceType:"t3.micro",
      subnetId: aws_private_subnet.id,
      keyName: aws_key_pair.id,
      vpcSecurityGroupIds:[aws_sg_k3s.id],
      userData:`#!/bin/bash
              apt-get update
              apt-get install -y curl
              
      `,
      dependsOn:[aws_nat_gateway_main,k3s_master]
    })

new TerraformOutput(this,"public_ip_nginx",{
  value: aws_nginx.publicIp
})
new TerraformOutput(this, "k3s_master_private_ip",{
  value: k3s_master.privateIp
})
new TerraformOutput(this, "k3s_worker_private_ip",{
  value: `\${aws_instance.k3s_workers[*].private_ip}`
})

  }
}

const app = new App();
new MyStack(app, "cdktf_k3s_cluster");
app.synth();

