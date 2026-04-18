variable "region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "bucket_name" {
  description = "Name of the S3 bucket for Terraform remote state"
  type        = string
  default     = "refresh-tf-core"
}

variable "lifecycle_noncurrent_days" {
  description = "Number of days after which noncurrent versions of tf state expire"
  type        = number
  default     = 60
}
