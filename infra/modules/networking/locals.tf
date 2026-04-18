locals {
  vpc_tags = merge(var.common_tags, {
    Name = "refresh-vpc"
  })

  public_subnet_tags = [
    for i in range(length(var.public_cidrs)) : merge(var.common_tags, {
      Name = "refresh-public-${i + 1}"
      Tier = "public"
    })
  ]

  private_subnet_tags = [
    for i in range(length(var.private_cidrs)) : merge(var.common_tags, {
      Name = "refresh-private-${i + 1}"
      Tier = "private"
    })
  ]
}
