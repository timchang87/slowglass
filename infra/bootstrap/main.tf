terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.11"
    }
  }
}

provider "aws" {
  region = var.region
}
resource "aws_s3_bucket" "tf_state" {
  # checkov:skip=CKV2_AWS_62: "Ensure S3 buckets should have event notifications enabled"
  # checkov:skip=CKV_AWS_144: "Ensure that S3 bucket has cross-region replication enabled"
  # checkov:skip=CKV_AWS_18: "Ensure the S3 bucket has access logging enabled"
  # checkov:skip=CKV_AWS_145: "Ensure that S3 buckets are encrypted with KMS by default"
  bucket = var.bucket_name

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_versioning" "tf_state" {
  bucket = aws_s3_bucket.tf_state.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "tf_state" {
  bucket = aws_s3_bucket.tf_state.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "tf_state" {
  # checkov:skip=CKV_AWS_300: "Ensure S3 lifecycle configuration sets period for aborting failed uploads"
  bucket     = aws_s3_bucket.tf_state.id
  depends_on = [aws_s3_bucket_versioning.tf_state]

  rule {
    id     = "expire-noncurrent-test-tfstate"
    status = "Enabled"

    filter {
      prefix = "test/"
    }

    noncurrent_version_expiration {
      noncurrent_days = var.lifecycle_noncurrent_days
    }
  }

  rule {
    id     = "expire-noncurrent-production-tfstate"
    status = "Enabled"

    filter {
      prefix = "production/"
    }

    noncurrent_version_expiration {
      noncurrent_days = var.lifecycle_noncurrent_days
    }
  }
}

resource "aws_s3_bucket_public_access_block" "tf_state" {
  bucket = aws_s3_bucket.tf_state.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
