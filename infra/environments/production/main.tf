terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.11"
    }
  }

  backend "s3" {
    bucket = "refresh-tf-core"
    key    = "production/terraform.tfstate"
    region = "us-east-1"
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = var.common_tags
  }
}

# Networking Module
module "networking" {
  source             = "../../modules/networking"
  common_tags        = var.common_tags
  vpc_cidr           = var.vpc_cidr
  public_cidrs       = var.public_cidrs
  public_subnet_azs  = var.public_subnet_azs
  private_cidrs      = var.private_cidrs
  personal_public_ip = var.personal_public_ip
  public_sg_id       = module.security.public_load_balancer_sg_id
}

# Security Module
module "security" {
  source                       = "../../modules/security"
  common_tags                  = var.common_tags
  vpc_id                       = module.networking.vpc_id
  personal_public_ip           = var.personal_public_ip
  app_s3_deployment_bucket_arn = module.storage.app_s3_deployment_bucket.arn
}

module "compute" {
  source                        = "../../modules/compute"
  asg_desired_capacity          = var.asg_desired_capacity
  asg_max_size                  = var.asg_max_size
  asg_min_size                  = var.asg_min_size
  target_group_arns             = [module.networking.app_target_group_arn]
  ami_id                        = var.ami_id
  instance_type                 = var.instance_type
  common_tags                   = var.common_tags
  private_app_sg_id             = module.security.private_app_sg_id
  asg_instance_profile_name     = module.security.asg_instance_profile_name
  private_subnet_ids            = module.networking.private_subnet_ids
  public_lb_sg_id               = module.security.public_load_balancer_sg_id
  public_subnet_id              = element(module.networking.public_subnet_ids, 0)
  key_pair_name                 = var.key_pair_name
  bastion_instance_profile_name = module.security.bastion_instance_profile_name
}

module "storage" {
  source      = "../../modules/storage"
  common_tags = var.common_tags
}
