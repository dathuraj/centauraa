#!/bin/sh
# Generate self-signed SSL certificate for development

SSL_DIR="/app/ssl"

# Create directory if it doesn't exist
mkdir -p "$SSL_DIR"

# Check if certificates already exist
if [ -f "$SSL_DIR/cert.pem" ] && [ -f "$SSL_DIR/key.pem" ]; then
  echo "SSL certificates already exist, skipping generation"
  exit 0
fi

# Generate private key and certificate
openssl req -x509 -newkey rsa:2048 -keyout "$SSL_DIR/key.pem" -out "$SSL_DIR/cert.pem" \
  -days 365 -nodes \
  -subj "/C=US/ST=State/L=City/O=AngelBackend/CN=localhost"

chmod 600 "$SSL_DIR/key.pem"
chmod 644 "$SSL_DIR/cert.pem"

echo "SSL certificates generated successfully:"
echo "Certificate: $SSL_DIR/cert.pem"
echo "Private Key: $SSL_DIR/key.pem"
