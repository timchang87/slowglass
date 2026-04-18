# environments/production/variables.tf

# Core Configuration
variable "region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "common_tags" {
  description = "Common tags to apply to all resources"
  type        = map(string)
  default = {
    Project     = "refresh"
    Environment = "production"
    ManagedBy   = "Terraform"
  }
}

# Networking Configuration
variable "vpc_cidr" {
  description = "CIDR block for VPC"
  type        = string
  default     = "10.0.0.0/24"
}

variable "public_cidrs" {
  description = "CIDR blocks for public subnets"
  type        = list(string)
  default     = ["10.0.0.0/28", "10.0.0.16/28"]
}

variable "private_cidrs" {
  description = "CIDR blocks for private subnets"
  type        = string
  default     = "10.0.0.128/25"
}

variable "public_subnet_azs" {
  description = "Availability zones for public subnets"
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b"]
}

variable "personal_public_ip" {
  description = "Your personal public IP address for secure access"
  type        = string
  default     = ""
}

variable "asg_desired_capacity" {
  description = "Desired capacity for the Auto Scaling Group"
  type        = number
  default     = 1
}

variable "asg_max_size" {
  description = "Maximum size for the Auto Scaling Group"
  type        = number
  default     = 1
}

variable "asg_min_size" {
  description = "Minimum size for the Auto Scaling Group"
  type        = number
  default     = 1
}

variable "ami_id" {
  description = "The AMI ID for the EC2 instances"
  type        = string
  default     = "ami-0360c520857e3138f" # Ubuntu Server 24.04 LTS (ARM)
}

variable "instance_type" {
  description = "The instance type for the EC2 instances"
  type        = string
  default     = "t3.micro"
}

variable "key_pair_name" {
  description = "EC2 key pair name for SSH access"
  type        = string
}
