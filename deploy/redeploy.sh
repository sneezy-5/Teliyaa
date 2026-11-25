#!/usr/bin/env bash
# Reconstruit Teliyaa depuis zéro et le redéploie sur le Swarm.
# Ne touche ni à la base, ni à PgBouncer, ni à tes autres stacks.
#
# Usage (depuis la racine du projet, sur le serveur) :
#   PUBLIC_URL=http://IP_DU_SERVEUR:8080 ./deploy/redeploy.sh
#   PUBLIC_URL=https://teliyaa.com ./deploy/redeploy.sh        # une fois le domaine en place
set -euo pipefail

cd "$(dirname "$0")/.."

: "${PUBLIC_URL:?Indique l'adresse publique, ex. PUBLIC_URL=https://teliyaa.com ./deploy/redeploy.sh}"
[ -f deploy.env ] || { echo "deploy.env introuvable : cp deploy.env.example deploy.env puis remplis-le."; exit 1; }

echo "→ Récupération du code"
git pull --ff-only

echo "→ Arrêt du service Teliyaa"
docker stack rm teliyaa >/dev/null 2>&1 || true
# Attendre que l'ancien service soit vraiment parti (libère le port 3100)
while docker service ls --format '{{.Name}}' | grep -qx teliyaa_app; do sleep 2; done
sleep 3

echo "→ Construction de l'image (sans cache)"
docker build --no-cache --pull --build-arg PUBLIC_URL="$PUBLIC_URL" -t teliyaa:latest .

echo "→ Déploiement"
docker stack deploy -c docker-compose.yml teliyaa

echo "→ Logs (Ctrl+C pour quitter)"
sleep 5
# docker service logs -f --since 1m teliyaa_app
