#!/bin/bash

# Angel Backend Login Flow Test Script
# Tests: Login -> Get OTP from email -> Verify -> Access Protected Route

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
BASE_URL=${BASE_URL:-"http://angel-backend-dev-alb-448499488.us-west-2.elb.amazonaws.com"}
TEST_EMAIL=${TEST_EMAIL:-"dathurajp@gmail.com"}

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}  Angel Backend Login Flow Test${NC}"
echo -e "${BLUE}================================================${NC}\n"

echo -e "${YELLOW}Configuration:${NC}"
echo -e "  Backend URL: ${BASE_URL}"
echo -e "  Email: ${TEST_EMAIL}\n"

# Step 1: Health Check
echo -e "${YELLOW}[1/4] Testing Health Endpoint...${NC}"
HEALTH_RESPONSE=$(curl -s "${BASE_URL}/health")
echo "Response: ${HEALTH_RESPONSE}"

if echo "$HEALTH_RESPONSE" | jq -e '.status == "ok"' > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Backend is healthy${NC}\n"
else
    echo -e "${RED}✗ Backend health check failed${NC}"
    exit 1
fi

# Step 2: Login - Send OTP
echo -e "${YELLOW}[2/4] Logging in with ${TEST_EMAIL}...${NC}"
LOGIN_RESPONSE=$(curl -s -X POST "${BASE_URL}/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"${TEST_EMAIL}\"}")

echo "Response: ${LOGIN_RESPONSE}"

if echo "$LOGIN_RESPONSE" | jq -e '.message' > /dev/null 2>&1; then
    echo -e "${GREEN}✓ OTP sent successfully${NC}"
    echo -e "${BLUE}Check your email (${TEST_EMAIL}) for the OTP${NC}\n"
else
    echo -e "${RED}✗ Failed to send OTP${NC}"
    echo "$LOGIN_RESPONSE"
    exit 1
fi

# Step 3: Get OTP from user
echo -e "${YELLOW}[3/4] Enter the OTP from your email...${NC}"
read -p "Enter the 6-digit OTP code: " OTP

if [ -z "$OTP" ]; then
    echo -e "${RED}✗ OTP cannot be empty${NC}"
    exit 1
fi

# Step 4: Verify OTP and get JWT token
echo -e "\n${YELLOW}[4/4] Verifying OTP and getting JWT token...${NC}"
VERIFY_RESPONSE=$(curl -s -X POST "${BASE_URL}/auth/verify" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"${TEST_EMAIL}\",\"otp\":\"${OTP}\"}")

echo "Response: ${VERIFY_RESPONSE}"

# Extract JWT token
JWT_TOKEN=$(echo "$VERIFY_RESPONSE" | jq -r '.access_token // empty')

if [ -z "$JWT_TOKEN" ] || [ "$JWT_TOKEN" = "null" ]; then
    echo -e "${RED}✗ Failed to get JWT token - Invalid OTP or expired${NC}"
    echo "Response: ${VERIFY_RESPONSE}"
    exit 1
fi

echo -e "${GREEN}✓ JWT token received${NC}"
echo -e "${BLUE}Token (first 50 chars): ${JWT_TOKEN:0:50}...${NC}\n"

# Step 5: Test protected route
echo -e "${YELLOW}Testing protected route (/users/me)...${NC}"
PROFILE_RESPONSE=$(curl -s "${BASE_URL}/users/me" \
    -H "Authorization: Bearer ${JWT_TOKEN}")

echo "Response: ${PROFILE_RESPONSE}"

if echo "$PROFILE_RESPONSE" | jq -e '.id' > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Successfully accessed protected route${NC}"

    USER_EMAIL=$(echo "$PROFILE_RESPONSE" | jq -r '.email')
    USER_ID=$(echo "$PROFILE_RESPONSE" | jq -r '.id')

    echo -e "\n${GREEN}User Profile:${NC}"
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
echo -e "  ✓ Login (send OTP): OK"
echo -e "  ✓ Verify OTP: OK"
echo -e "  ✓ Get JWT token: OK"
echo -e "  ✓ Access protected route: OK"

echo -e "\n${YELLOW}Your JWT Token:${NC}"
echo "${JWT_TOKEN}"

echo -e "\n${BLUE}Test other endpoints:${NC}"
echo -e "  curl ${BASE_URL}/chat/history -H \"Authorization: Bearer ${JWT_TOKEN}\""
echo -e "  curl ${BASE_URL}/users/me -H \"Authorization: Bearer ${JWT_TOKEN}\""
echo ""
