-- À lancer UNE FOIS sur ton PostgreSQL (directement, PAS à travers PgBouncer),
-- avec un compte administrateur. Crée un utilisateur et une base dédiés à Teliyaa.
-- Remplace MOT_DE_PASSE (le même que dans DATABASE_URL de deploy.env).
--
-- Exemple (adapte le nom du conteneur PostgreSQL et l'utilisateur admin) :
--   docker exec -i $(docker ps -qf name=postgres | head -1) psql -U postgres < deploy/create-db.sql
--
-- PostgreSQL 13 minimum. Les tables sont créées automatiquement au démarrage de l'app.

create role teliyaa with login password 'MOT_DE_PASSE';
create database teliyaa owner teliyaa;
