variable "common_tags" {
  description = "Common tags to apply to all resources"
  type        = map(string)
  default = {
    Project     = "refresh"
    Environment = "staging"
    ManagedBy   = "Terraform"
  }
}
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
  type        = list(string)
  default     = ["10.0.0.32/27", "10.0.0.64/27"]
}

variable "subnet_azs" {
  description = "Availability zones for subnets"
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b"]
}

variable "personal_public_ip" {
  description = "Your personal public IP address for secure access"
  type        = string
}