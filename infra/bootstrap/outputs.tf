output "state_bucket_name" {
  description = "Name of the S3 bucket backing Terraform remote state"
  value       = aws_s3_bucket.tf_state.bucket
}
