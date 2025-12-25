# Adding OpenAI API Key to Server

## Quick Method

Run this command (replace `sk-...` with your actual OpenAI API key):

```bash
ssh -i "/Users/toddponskymd/Desktop/Cursor Projects/AWS/EmpowerAI.pem" -o StrictHostKeyChecking=no ec2-user@3.14.156.143 "cd cv-creator && export OPENAI_API_KEY='sk-your-key-here' && docker-compose up -d app"
```

## Persistent Method (Recommended)

To make it persist across server reboots, add it to a `.env` file on the server:

```bash
ssh -i "/Users/toddponskymd/Desktop/Cursor Projects/AWS/EmpowerAI.pem" -o StrictHostKeyChecking=no ec2-user@3.14.156.143 << 'EOF'
cd cv-creator
echo "OPENAI_API_KEY=sk-your-key-here" >> .env
docker-compose down
docker-compose up -d
EOF
```

Then update `docker-compose.yml` to use `.env` file by adding:
```yaml
env_file:
  - .env
```

Or keep using environment variables and make sure to export them before running docker-compose.

## Verify It's Set

After setting the key, verify it's working:

```bash
ssh -i "/Users/toddponskymd/Desktop/Cursor Projects/AWS/EmpowerAI.pem" -o StrictHostKeyChecking=no ec2-user@3.14.156.143 "cd cv-creator && docker-compose exec app env | grep OPENAI_API_KEY"
```

You should see your key (partially masked for security).

