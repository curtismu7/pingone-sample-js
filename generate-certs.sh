a#!/bin/bash

# Create certs directory if it doesn't exist
mkdir -p certs

# Generate private key and self-signed certificate
openssl req -x509 \
  -newkey rsa:4096 \
  -keyout certs/key.pem \
  -out certs/cert.pem \
  -days 365 \
  -nodes \
  -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"

# Set proper permissions
chmod 600 certs/key.pem certs/cert.pem

echo "SSL certificates generated in the 'certs' directory"
