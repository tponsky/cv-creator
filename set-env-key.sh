#!/bin/bash
# Helper script to set OpenAI API key on the server

if [ -z "$1" ]; then
    echo "Usage: ./set-env-key.sh <your-openai-api-key>"
    echo ""
    echo "Example:"
    echo "  ./set-env-key.sh sk-..."
    exit 1
fi

API_KEY="$1"
SERVER="ec2-user@3.14.156.143"
KEY_FILE="/Users/toddponskymd/Desktop/Cursor Projects/AWS/EmpowerAI.pem"

echo "Setting OPENAI_API_KEY on server..."

# Set the environment variable and restart containers
ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no "$SERVER" << EOF
cd cv-creator
export OPENAI_API_KEY="$API_KEY"
echo "OPENAI_API_KEY set in current session"

# Add to .env file for persistence (if it exists)
if [ -f .env ]; then
    if grep -q "^OPENAI_API_KEY=" .env; then
        sed -i "s|^OPENAI_API_KEY=.*|OPENAI_API_KEY=$API_KEY|" .env
    else
        echo "OPENAI_API_KEY=$API_KEY" >> .env
    fi
    echo "Added to .env file"
fi

# Restart containers with the new env var
echo "Restarting containers..."
OPENAI_API_KEY="$API_KEY" docker-compose up -d app

echo "Done! Containers restarted with OPENAI_API_KEY"
EOF

echo ""
echo "✅ OpenAI API key has been set and containers restarted!"
echo ""
echo "To verify, run:"
echo "  ssh -i \"$KEY_FILE\" $SERVER 'cd cv-creator && docker-compose exec app env | grep OPENAI_API_KEY'"

