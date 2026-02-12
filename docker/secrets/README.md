# Docker Secrets - README

## Setup Instructions

Before deploying, you need to create the actual secret files from the examples:

1. Copy the example files:
```bash
cp docker/secrets/jwt_secret.txt.example docker/secrets/jwt_secret.txt
cp docker/secrets/mail_password.txt.example docker/secrets/mail_password.txt
```

2. Edit the files and replace with your actual secrets:
```bash
nano docker/secrets/jwt_secret.txt
nano docker/secrets/mail_password.txt
```

3. Set proper permissions (important for security):
```bash
chmod 600 docker/secrets/*.txt
```

## Important Notes

- **NEVER** commit the actual secret files (`.txt`) to git
- Only the `.example` files should be in version control
- The `.gitignore` should exclude `docker/secrets/*.txt`
- JWT secret should be at least 32 characters long
- Mail password is your SMTP email account password

## Security

These files are mounted as Docker secrets and are only accessible to containers that need them.
They are never exposed as environment variables in `docker inspect` output.
