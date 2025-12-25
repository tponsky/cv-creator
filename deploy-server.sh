#!/bin/bash

# Server-side deployment script for CV Creator
# Run this on your server after copying the updated files

set -e

echo "🚀 CV Creator Server Deployment"
echo "================================"
echo ""

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Check if we're in the right directory
if [ ! -f "docker-compose.yml" ]; then
    echo -e "${RED}❌ Error: docker-compose.yml not found. Are you in the project directory?${NC}"
    exit 1
fi

# Check if docker-compose is available
if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}❌ docker-compose not found${NC}"
    exit 1
fi

echo -e "${GREEN}✓${NC} Docker Compose found"
echo ""

# Step 1: Build new images
echo "📦 Building Docker images..."
if docker-compose build; then
    echo -e "${GREEN}✓${NC} Images built successfully"
else
    echo -e "${RED}❌ Build failed${NC}"
    exit 1
fi
echo ""

# Step 2: Stop existing containers
echo "🛑 Stopping existing containers..."
docker-compose down
echo -e "${GREEN}✓${NC} Containers stopped"
echo ""

# Step 3: Start services
echo "▶️  Starting services..."
docker-compose up -d
echo -e "${GREEN}✓${NC} Services started"
echo ""

# Step 4: Wait for services
echo "⏳ Waiting for services to initialize..."
sleep 10

# Step 5: Check service status
echo "🔍 Checking service status..."
docker-compose ps
echo ""

# Step 6: Check worker logs
echo "📋 Recent worker logs:"
docker-compose logs --tail=20 worker
echo ""

# Step 7: Test health endpoint (if app is accessible)
echo "🏥 Testing health endpoint..."
sleep 5

# Try to get the port from docker-compose or use default
PORT=$(docker-compose port app 3000 2>/dev/null | cut -d: -f2 || echo "3001")
HEALTH_URL="http://localhost:${PORT}/api/import/cv/health"

if curl -s -f "$HEALTH_URL" > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Health endpoint is accessible"
    echo ""
    echo "Health check response:"
    curl -s "$HEALTH_URL" | python3 -m json.tool 2>/dev/null || curl -s "$HEALTH_URL"
    echo ""
else
    echo -e "${YELLOW}⚠${NC}  Health endpoint not ready yet"
    echo "   Try manually: curl $HEALTH_URL"
    echo ""
fi

# Step 8: Verify worker is processing
echo "🔍 Checking worker status..."
WORKER_LOGS=$(docker-compose logs worker 2>/dev/null | grep -i "started and listening" | tail -1)
if [ -n "$WORKER_LOGS" ]; then
    echo -e "${GREEN}✓${NC} Worker appears to be running"
    echo "   $WORKER_LOGS"
else
    echo -e "${YELLOW}⚠${NC}  Could not confirm worker started. Check logs:"
    echo "   docker-compose logs worker"
fi
echo ""

echo -e "${GREEN}✅ Deployment complete!${NC}"
echo ""
echo "Next steps:"
echo "  1. Monitor worker: docker-compose logs -f worker"
echo "  2. Test CV upload in the web interface"
echo "  3. Check health: curl $HEALTH_URL"
echo ""

