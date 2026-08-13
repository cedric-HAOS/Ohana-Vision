# ROADMAP

## Mission

Ohana-Vision transforme les données produites par Ohana-Agent en une
représentation lisible, temps réel et historique de l'infrastructure.

Ohana-Agent reste propriétaire de la configuration et de l'exécution des
observations. Vision valide, persiste, projette et présente les snapshots et
observations reçus. Les opérations d'administration passent exclusivement par
les contrats publics et versionnés de l'Agent.

## État actuel

**Version préparée : 1.12.0 — Sauvegarde d'INFRA-01.**

Le socle actuel couvre notamment :

- la visualisation temps réel de l'infrastructure, des services et des
  capacités ;
- le cockpit de supervision des ressources, des uptimes et des diagnostics
  systemd de la machine hôte d'Agent ;
- l'administration graphique de l'infrastructure, du réseau, du DHCP et des
  plugins exposés par Agent ;
- la configuration des sauvegardes HAOS vers iCloud, avec activation et
  horaire distincts pour chaque cible et secrets conservés côté Agent ;
- la configuration, la planification, la rétention et le déclenchement manuel
  de la sauvegarde logique chiffrée d'INFRA-01 ;
- la présence réseau et les plages de surveillance ;
- la persistance durable des observations ;
- le regroupement des évaluations répétitives ;
- le cycle de vie des incidents, avec acquittement et silence temporaire.

Le détail exhaustif des versions et correctifs publiés est conservé dans le
[CHANGELOG](CHANGELOG.md).

---

## Jalons livrés

### 1.0 — Socle de visualisation

- domaine backend, stockage des observations et moteurs de projection, santé
  et timeline ;
- API REST, WebSocket et runtime applicatif ;
- dashboard, topologie interactive et frontend modulaire.

**Statut : livré.**

### 1.1 — Infrastructure pilotée par Agent

- contrat d'infrastructure strict et versionné ;
- ingestion atomique par `PUT /api/infrastructure` ;
- topologie complète avec équipements, liaisons et positions logiques ;
- synchronisation résiliente Agent ↔ Vision.

**Statut : livré.**

### 1.2 — Administration graphique

- configuration DHCP et gestion des réservations ;
- édition de l'architecture, des équipements, des liaisons et des services ;
- proxy backend authentifié, sans exposition du jeton Agent au navigateur.

**Statut : livré.**

### 1.3 — Administration des plugins

- inventaire des plugins réellement enregistrés dans Agent ;
- lecture, modification, reconfiguration et test immédiat ;
- formulaires dédiés pour DNS, NTP et MQTT ;
- gestion des états vides, erreurs, confirmations et secrets.

**Statut : livré.**

### 1.4 — Présence réseau des équipements

- prise en charge de la capacité `network.reachable` ;
- distinction entre présence réseau et santé des services ;
- indicateurs de présence dans la topologie et informations de diagnostic dans
  l'inspecteur.

**Statut : livré.**

### 1.5 à 1.7 — Réseau, télémétrie et Téléinformation

- administration et présentation des plugins Z-Wave, WireGuard, Freebox et
  Shelly Telemetry ;
- amélioration progressive de la configuration par équipement ;
- intégration de la Téléinformation Linky ;
- validation renforcée des noms utilisés par les réservations DHCP.

**Statut : livré.**

### 1.8 — Télémétrie et formulaires de services

- présentation du plugin de télémétrie Home Assistant ;
- migration visuelle des anciens services `shelly_telemetry` ;
- prise en charge des adresses IPv4 et noms DNS ;
- formulaires adaptés au type de service.

**Statut : livré.**

### 1.9 — Téléinformation directe et plages de surveillance

- configuration de l'envoi HTTP direct depuis `teleinfo2mqtt` ;
- identification du compteur Linky et de sa source ;
- plages horaires par équipement, héritées par les services et la présence
  réseau ;
- état suspendu neutre dans la santé globale et les incidents.

**Statut : livré.**

### 1.10 — Administration réseau et enrichissement de la topologie

- lecture et configuration NetworkManager avec confirmation et rollback ;
- lecture visuelle des capacités Ethernet ;
- découverte, positionnement et rendu des équipements Z-Wave ;
- cohérence temps réel des cartes, services et timelines.

**Statut : livré.**

### 1.11 — Persistance et centre d'incidents

- stockage SQLite et restauration des observations ;
- ingestion idempotente fondée sur `observation_id` ;
- ouverture, mise à jour, résolution, acquittement et silence des incidents ;
- regroupement et filtrage des évaluations répétitives ;
- navigation fluide dans l'éditeur d'architecture et création d'une
  réservation depuis un bail DHCP dynamique.

**Statut : livré.**

---

## Prochaines priorités

### Maintenant — Consolidation de la version 1.11

- qualifier la volumétrie, les performances et la rétention du stockage
  durable ;
- renforcer les diagnostics de restauration et de projection des incidents ;
- poursuivre la simplification des vues d'observations et d'incidents ;
- détailler les statistiques par capacité.

**Statut : en consolidation.**

### Ensuite — Historique et rapports

- zoom et navigation dans la timeline ;
- recherche et comparaison de périodes ;
- évolution d'une capacité et comparaison de snapshots d'infrastructure ;
- rapports de disponibilité et de SLA ;
- export CSV et PDF.

**Statut : planifié.**

### Plus tard — Sécurité et utilisateurs

- authentification ;
- rôles et permissions ;
- préférences utilisateur ;
- audit des actions ;
- notifications et Webhooks.

**Statut : à cadrer.**

### Plus tard — Écosystème Ohana

- prise en charge de plusieurs Agents et de plusieurs sites ;
- vues par site et vue consolidée ;
- gestion des conflits d'identifiants ;
- documentation des contrats et capacités des plugins ;
- diagnostics et actions contrôlées avec suivi d'exécution.

**Statut : exploration.**

---

## Principes durables

Les évolutions de Vision doivent préserver les règles suivantes :

1. Agent reste la source de vérité de l'infrastructure et de son exécution ;
2. Vision ne réalise une opération d'administration qu'à travers un contrat
   public et versionné ;
3. la santé est projetée à partir des capacités observées ;
4. la présence réseau reste distincte de la santé fonctionnelle ;
5. les données durables doivent pouvoir être restaurées sans doublon ;
6. le détail des releases appartient au changelog, pas à la roadmap ;
7. chaque évolution doit rester testable, accessible et exploitable sur les
   différentes tailles d'écran.
