# ROADMAP

## Mission

Ohana-Vision transforme les données produites par Ohana-Agent en une
représentation lisible, temps réel et historique de l'infrastructure.

Ohana-Agent reste propriétaire de la configuration, de l'exécution et des
décisions opérationnelles. Vision valide, persiste, projette et présente les
snapshots, observations, incidents et résultats reçus. Les opérations
d'administration passent exclusivement par les contrats publics et versionnés de
l'Agent.

## État actuel

**Version publiée : 1.22.9 — Décision Tsunade prioritaire.**

Le socle actuel couvre notamment :

- la visualisation temps réel de l'infrastructure, des services et des
  capacités ;
- le cockpit de supervision des ressources, uptimes et diagnostics systemd de
  la machine hôte d'Agent ;
- l'administration graphique de l'infrastructure, du réseau, du DHCP, des
  plugins, des workers Katsuyu et des compagnons Shizune ;
- la configuration des sauvegardes HAOS vers iCloud et de la sauvegarde logique
  chiffrée d'INFRA-01 ;
- la présence réseau, les plages de surveillance et l'état suspendu neutre ;
- la persistance durable des observations, la maîtrise du WAL et la projection
  des incidents ;
- la page Tsunade comme cockpit d'incidents, de diagnostic, d'analyse et de
  décision ;
- le suivi des jobs `logs.health_check`, des anomalies de journaux, des
  investigations bornées et des analyses Katsuyu ;
- l'affichage des hypothèses, preuves, commandes copiables et erreurs techniques
  Katsuyu ;
- les réparations supervisées, leur autorisation explicite et leur résultat ;
- la PWA Shizune et sa passerelle bornée, sans exposition du jeton Agent au
  navigateur.

Le détail exhaustif des versions et correctifs publiés est conservé dans le
[CHANGELOG](CHANGELOG.md).

---

## Jalons livrés

### 1.0 — Socle de visualisation

- domaine backend, stockage des observations et moteurs de projection ;
- API REST, WebSocket, santé, timeline et runtime applicatif ;
- dashboard, topologie interactive et frontend modulaire.

**Statut : livré.**

### 1.1 à 1.3 — Infrastructure et administration

- contrat d'infrastructure strict et versionné ;
- ingestion atomique par `PUT /api/infrastructure` ;
- topologie complète avec équipements, liaisons et positions logiques ;
- configuration DHCP, architecture, réseau et plugins exposés par Agent ;
- proxy backend authentifié, sans exposition du jeton Agent au navigateur.

**Statut : livré.**

### 1.4 à 1.10 — Présence, télémétrie et topologie

- indicateurs de présence réseau distincts de la santé fonctionnelle ;
- administration et présentation Z-Wave, WireGuard, Freebox et télémétrie ;
- Téléinformation Linky et envoi HTTP direct depuis `teleinfo2mqtt` ;
- formulaires adaptés au type de service ;
- NetworkManager, rollback, capacités Ethernet et cohérence temps réel.

**Statut : livré.**

### 1.11 à 1.13 — Persistance, incidents et sauvegardes

- stockage SQLite et restauration des observations ;
- ingestion idempotente fondée sur `observation_id` ;
- ouverture, mise à jour, résolution, acquittement et silence des incidents ;
- configuration des sauvegardes HAOS et INFRA-01 ;
- carte de sauvegarde stable pendant les rafraîchissements temps réel.

**Statut : livré.**

### 1.14 à 1.17 — Hôte, appairage et workers Katsuyu

- page Hôte indépendante du pool de workers ;
- appairage Katsuyu et confiance TLS à comparer avec l'installateur ;
- page **Workers Katsuyu** avec état, capacités, dernière connexion et origine
  du réveil ;
- séparation stricte entre affichage Vision et exécution Agent/Tsunade.

**Statut : livré.**

### 1.18 et 1.19 — Incidents et expertise Tsunade

- page **Tsunade** alimentée par la source de vérité Agent ;
- incidents actifs, en cours, traités et résolus ;
- diagnostic Tsunade déclenché depuis Vision sans lancer directement Katsuyu ;
- distinction entre diagnostics déterministes et hypothèses Katsuyu AI ;
- affichage des hypothèses, confiance, causes, preuves et contradictions.

**Statut : livré.**

### 1.20 et 1.21 — Cockpit Tsunade complet

- réparation supervisée de `dnsmasq.service` avec autorisation explicite ;
- expérience de réparation connue enregistrable après confirmation ;
- contrôle quotidien des journaux HA-01, LINKY-01 et ZWAVE-01 ;
- investigation complémentaire `logs.health` avec motif borné ;
- purge SQLite par lots et checkpoints WAL passifs.

**Statut : livré.**

### 1.22 — Wake-on-LAN, Shizune et analyse exploitable

- page **Workers Katsuyu** avec politique Wake-on-LAN effective et test de réveil ;
- administration Shizune, association, révocation et passerelle PWA bornée ;
- commandes d'investigation copiables réservées à la page Tsunade ;
- erreurs techniques Katsuyu affichées explicitement ;
- décision Tsunade, confiance et actions rendues visibles avant les détails ;
- anomalies de journaux repliables sans ouvrir l'évolution complète.

**Statut : livré.**

---

## Prochaines priorités

### Maintenant — Lisibilité opérationnelle de Tsunade

- stabiliser le rendu des cartes longues : décision, actions, journaux,
  analyse, réparation et évolution ;
- faciliter le diagnostic des timeouts Katsuyu et des réveils manqués depuis
  l'interface ;
- clarifier les états `À approfondir`, `Surveillance`, `Action nécessaire` et
  leurs conséquences opérateur ;
- vérifier le confort mobile et bureau des cartes Tsunade les plus denses.

**Statut : en consolidation.**

### Ensuite — Historique et rapports

- zoom et navigation dans la timeline ;
- recherche et comparaison de périodes ;
- évolution d'une capacité et comparaison de snapshots d'infrastructure ;
- rapports de disponibilité et de SLA ;
- export CSV et PDF.

**Statut : planifié.**

### Plus tard — Sécurité, utilisateurs et multi-site

- authentification ;
- rôles et permissions ;
- préférences utilisateur ;
- audit des actions ;
- notifications et Webhooks ;
- vues par site, vue consolidée et prévention des conflits d'identifiants.

**Statut : à cadrer.**

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
7. les décisions, justifications et actions doivent rester visibles avant les
   détails secondaires ;
8. chaque évolution doit rester testable, accessible et exploitable sur les
   différentes tailles d'écran.
