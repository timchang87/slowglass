resource "aws_vpc" "main" {
  cidr_block           = vpc_cidr
  tags                 = local.vpc_tags
  enable_dns_support   = true
  enable_dns_hostnames = true
}

resource "aws_subnet" "public" {
  vpc_id = aws_vpc.main.id
  count = length(var.public_cidrs)
  cidr_block = var.public_cidrs[count.index]
  availability_zone = var.subnet_azs[count.index]
  tags = local.vpc_tags
}

resource "aws_subnet" "private" {
  vpc_id     = aws_vpc.main.id
  count      = length(var.private_cidrs)
  cidr_block = var.private_cidrs[count.index]
  availability_zone = var.subnet_azs[count.index]
  tags = local.vpc_tags
}