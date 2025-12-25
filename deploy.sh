#!/bin/bash

# CV Creator Deployment Script
# This script helps deploy the updated CV upload functionality

set -e  # Exit on error

echo "🚀 CV Creator Deployment Script"
echo "================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if docker-compose is available
if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}❌ docker-compose not found. Please install Docker Compose.${NC}"
    exit 1
fi

echo -e "${GREEN}✓${NC} Docker Compose found"
echo ""

# Step 1: Build new images
echo "📦 Step 1: Building Docker images..."
docker-compose build
echo -e "${GREEN}✓${NC} Images built successfully"
echo ""

# Step 2: Stop existing containers
echo "🛑 Step 2: Stopping existing containers..."
docker-compose down
echo -e "${GREEN}✓${NC} Containers stopped"
echo ""

# Step 3: Start services
echo "▶️  Step 3: Starting services..."
docker-compose up -d
echo -e "${GREEN}✓${NC} Services started"
echo ""

# Step 4: Wait for services to be ready
echo "⏳ Step 4: Waiting for services to be ready..."
sleep 5

# Check if services are running
echo "🔍 Checking service status..."
docker-compose ps

echo ""
echo -e "${YELLOW}📋 Next Steps:${NC}"
echo "1. Check worker logs: docker-compose logs worker"
echo "2. Check app logs: docker-compose logs app"
echo "3. Test health endpoint: curl http://localhost:3001/api/import/cv/health"
echo "4. Monitor worker: docker-compose logs -f worker"
echo ""

# Step 5: Check health endpoint (if app is ready)
echo "🏥 Step 5: Checking health endpoint..."
sleep 3

if curl -s http://localhost:3001/api/import/cv/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Health endpoint is accessible"
    echo ""
    echo "Health check response:"
    curl -s http://localhost:3001/api/import/cv/health | python3 -m json.tool 2>/dev/null || curl -s http://localhost:3001/api/import/cv/health
else
    echo -e "${YELLOW}⚠${NC}  Health endpoint not ready yet. Wait a few seconds and try:"
    echo "   curl http://localhost:3001/api/import/cv/health"
fi

echo ""
echo -e "${GREEN}✅ Deployment complete!${NC}"
echo ""
echo "To monitor the worker in real-time:"
echo "  docker-compose logs -f worker"
echo ""


