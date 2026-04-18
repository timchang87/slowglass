# production

<!-- BEGIN_TF_DOCS -->
## Requirements

| Name | Version |
|------|---------|
| <a name="requirement_terraform"></a> [terraform](#requirement\_terraform) | >= 1.0 |
| <a name="requirement_aws"></a> [aws](#requirement\_aws) | ~> 6.11 |

## Providers

No providers.

## Modules

| Name | Source | Version |
|------|--------|---------|
| <a name="module_compute"></a> [compute](#module\_compute) | ../../modules/compute | n/a |
| <a name="module_networking"></a> [networking](#module\_networking) | ../../modules/networking | n/a |
| <a name="module_security"></a> [security](#module\_security) | ../../modules/security | n/a |
| <a name="module_storage"></a> [storage](#module\_storage) | ../../modules/storage | n/a |

## Resources

No resources.

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| <a name="input_ami_id"></a> [ami\_id](#input\_ami\_id) | The AMI ID for the EC2 instances | `string` | `"ami-0360c520857e3138f"` | no |
| <a name="input_asg_desired_capacity"></a> [asg\_desired\_capacity](#input\_asg\_desired\_capacity) | Desired capacity for the Auto Scaling Group | `number` | `1` | no |
| <a name="input_asg_max_size"></a> [asg\_max\_size](#input\_asg\_max\_size) | Maximum size for the Auto Scaling Group | `number` | `1` | no |
| <a name="input_asg_min_size"></a> [asg\_min\_size](#input\_asg\_min\_size) | Minimum size for the Auto Scaling Group | `number` | `1` | no |
| <a name="input_common_tags"></a> [common\_tags](#input\_common\_tags) | Common tags to apply to all resources | `map(string)` | <pre>{<br/>  "Environment": "production",<br/>  "ManagedBy": "Terraform",<br/>  "Project": "refresh"<br/>}</pre> | no |
| <a name="input_instance_type"></a> [instance\_type](#input\_instance\_type) | The instance type for the EC2 instances | `string` | `"t3.micro"` | no |
| <a name="input_key_pair_name"></a> [key\_pair\_name](#input\_key\_pair\_name) | EC2 key pair name for SSH access | `string` | n/a | yes |
| <a name="input_personal_public_ip"></a> [personal\_public\_ip](#input\_personal\_public\_ip) | Your personal public IP address for secure access | `string` | `""` | no |
| <a name="input_private_cidrs"></a> [private\_cidrs](#input\_private\_cidrs) | CIDR blocks for private subnets | `string` | `"10.0.0.128/25"` | no |
| <a name="input_public_cidrs"></a> [public\_cidrs](#input\_public\_cidrs) | CIDR blocks for public subnets | `list(string)` | <pre>[<br/>  "10.0.0.0/28",<br/>  "10.0.0.16/28"<br/>]</pre> | no |
| <a name="input_public_subnet_azs"></a> [public\_subnet\_azs](#input\_public\_subnet\_azs) | Availability zones for public subnets | `list(string)` | <pre>[<br/>  "us-east-1a",<br/>  "us-east-1b"<br/>]</pre> | no |
| <a name="input_region"></a> [region](#input\_region) | AWS region | `string` | `"us-east-1"` | no |
| <a name="input_vpc_cidr"></a> [vpc\_cidr](#input\_vpc\_cidr) | CIDR block for VPC | `string` | `"10.0.0.0/24"` | no |

## Outputs

No outputs.
<!-- END_TF_DOCS -->
