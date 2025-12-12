#!/bin/bash

# Angel Backend Authentication Flow Test Script
# Tests: Register/Login -> Verify OTP -> Access Protected Route
# Usage:
#   ./test-auth-flow.sh                  # Register new user
#   ./test-auth-flow.sh --login          # Login existing user
#   TEST_EMAIL=your@email.com ./test-auth-flow.sh --login

set -e

# Parse arguments
USE_LOGIN=false
if [[ "$1" == "--login" ]]; then
    USE_LOGIN=true
fi

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
BASE_URL=${BASE_URL:-"http://angel-backend-dev-alb-448499488.us-west-2.elb.amazonaws.com"}
if [ "$USE_LOGIN" = true ]; then
    TEST_EMAIL=${TEST_EMAIL:-"dathurajp@gmail.com"}
else
    TEST_EMAIL=${TEST_EMAIL:-"test-$(date +%s)@example.com"}
fi
AWS_REGION=${AWS_REGION:-"us-west-2"}

echo -e "${BLUE}================================================${NC}"
if [ "$USE_LOGIN" = true ]; then
    echo -e "${BLUE}  Angel Backend Login Flow Test${NC}"
else
    echo -e "${BLUE}  Angel Backend Registration Flow Test${NC}"
fi
echo -e "${BLUE}================================================${NC}\n"

echo -e "${YELLOW}Configuration:${NC}"
echo -e "  Mode: $([ "$USE_LOGIN" = true ] && echo "LOGIN" || echo "REGISTER")"
echo -e "  Backend URL: ${BASE_URL}"
echo -e "  Email: ${TEST_EMAIL}"
echo -e "  Region: ${AWS_REGION}\n"

# Step 1: Health Check
echo -e "${YELLOW}[1/5] Testing Health Endpoint...${NC}"
HEALTH_RESPONSE=$(curl -s "${BASE_URL}/health")
echo "Response: ${HEALTH_RESPONSE}"

if echo "$HEALTH_RESPONSE" | jq -e '.status == "ok"' > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Backend is healthy${NC}\n"
else
    echo -e "${RED}✗ Backend health check failed${NC}"
    exit 1
fi

# Step 2: Register or Login - Send OTP
if [ "$USE_LOGIN" = true ]; then
    echo -e "${YELLOW}[2/5] Logging in with ${TEST_EMAIL}...${NC}"
    AUTH_ENDPOINT="${BASE_URL}/auth/login"
else
    echo -e "${YELLOW}[2/5] Registering ${TEST_EMAIL}...${NC}"
    AUTH_ENDPOINT="${BASE_URL}/auth/register"
fi

AUTH_RESPONSE=$(curl -s -X POST "${AUTH_ENDPOINT}" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"${TEST_EMAIL}\"}")

echo "Response: ${AUTH_RESPONSE}"

if echo "$AUTH_RESPONSE" | jq -e '.message' > /dev/null 2>&1; then
    echo -e "${GREEN}✓ OTP request sent successfully${NC}"
else
    echo -e "${RED}✗ Failed to send OTP${NC}"
    echo "$AUTH_RESPONSE"
    exit 1
fi

# Step 3: Get OTP
echo -e "\n${YELLOW}[3/5] Getting OTP...${NC}"

if [ "$USE_LOGIN" = true ]; then
    echo -e "${BLUE}Check your email (${TEST_EMAIL}) for the OTP${NC}"
    read -p "Enter the 6-digit OTP code: " OTP
else
    echo -e "${BLUE}Trying to retrieve OTP from logs...${NC}"
    # Wait a moment for logs to be available
    sleep 3

    # Try to find OTP in logs
    OTP=$(aws logs tail /ecs/angel-backend-dev/backend \
        --since 2m \
        --region ${AWS_REGION} \
        --format short 2>/dev/null | \
        grep -i "otp\|code" | \
        grep -oE '[0-9]{6}' | \
        tail -1)

    if [ -z "$OTP" ]; then
        echo -e "${YELLOW}⚠ Could not automatically retrieve OTP from logs${NC}"
        echo -e "${BLUE}Please check your email or backend logs:${NC}"
        echo "  aws logs tail /ecs/angel-backend-dev/backend --since 5m --follow --region ${AWS_REGION}"
        echo ""
        read -p "Enter the 6-digit OTP code: " OTP
    else
        echo -e "${GREEN}✓ Found OTP in logs: ${OTP}${NC}"
    fi
fi

if [ -z "$OTP" ]; then
    echo -e "${RED}✗ OTP cannot be empty${NC}"
    exit 1
fi

# Step 4: Verify OTP and get JWT token
echo -e "\n${YELLOW}[4/5] Verifying OTP and getting JWT token...${NC}"
VERIFY_RESPONSE=$(curl -s -X POST "${BASE_URL}/auth/verify" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"${TEST_EMAIL}\",\"otp\":\"${OTP}\"}")

echo "Response: ${VERIFY_RESPONSE}"

# Extract JWT token
JWT_TOKEN=$(echo "$VERIFY_RESPONSE" | jq -r '.access_token // empty')

if [ -z "$JWT_TOKEN" ] || [ "$JWT_TOKEN" = "null" ]; then
    echo -e "${RED}✗ Failed to get JWT token${NC}"
    echo "Response: ${VERIFY_RESPONSE}"
    exit 1
fi

echo -e "${GREEN}✓ JWT token received${NC}"
echo -e "${BLUE}Token (first 50 chars): ${JWT_TOKEN:0:50}...${NC}"

# Step 5: Access protected route with JWT
echo -e "\n${YELLOW}[5/5] Testing protected route (/users/me)...${NC}"
PROFILE_RESPONSE=$(curl -s "${BASE_URL}/users/me" \
    -H "Authorization: Bearer ${JWT_TOKEN}")

echo "Response: ${PROFILE_RESPONSE}"

if echo "$PROFILE_RESPONSE" | jq -e '.id' > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Successfully accessed protected route${NC}"

    USER_EMAIL=$(echo "$PROFILE_RESPONSE" | jq -r '.email')
    USER_ID=$(echo "$PROFILE_RESPONSE" | jq -r '.id')

    echo -e "\n${GREEN}User Details:${NC}"
    echo "  ID: ${USER_ID}"
    echo "  Email: ${USER_EMAIL}"
else
    echo -e "${RED}✗ Failed to access protected route${NC}"
    echo "Response: ${PROFILE_RESPONSE}"
    exit 1
fi

# Summary
echo -e "\n${BLUE}================================================${NC}"
echo -e "${GREEN}✓ ALL TESTS PASSED!${NC}"
echo -e "${BLUE}================================================${NC}\n"

echo -e "${YELLOW}Test Summary:${NC}"
echo -e "  ✓ Health check: OK"
echo -e "  ✓ Send OTP: OK"
echo -e "  ✓ Verify OTP: OK"
echo -e "  ✓ Get JWT token: OK"
echo -e "  ✓ Access protected route: OK"

echo -e "\n${YELLOW}Credentials for this test:${NC}"
echo -e "  Email: ${TEST_EMAIL}"
echo -e "  JWT Token: ${JWT_TOKEN}"

echo -e "\n${BLUE}You can use this token to test other endpoints:${NC}"
echo -e "  curl ${BASE_URL}/users/me -H \"Authorization: Bearer ${JWT_TOKEN}\""
echo -e "  curl ${BASE_URL}/chat/history -H \"Authorization: Bearer ${JWT_TOKEN}\""
echo ""
