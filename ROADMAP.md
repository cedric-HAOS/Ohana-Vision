# ROADMAP

## Vision

Ohana-Vision transforme les données produites par Ohana-Agent en une représentation lisible, temps réel et historique de l'infrastructure.

Ohana-Agent reste propriétaire de la configuration et de l'exécution des observations. Vision valide, projette et présente les snapshots et observations reçus.

---

# Socle de visualisation

## Phase 3.1 — Domaine backend

- Observation Store
- Projection Engine
- Health Engine
- Timeline Engine
- objets métier immuables

**Statut :** ✅ Terminé

## Phase 3.2 — Runtime et API

- Observation Processor
- API REST
- WebSocket
- runtime applicatif

**Statut :** ✅ Terminé

## Phase 3.3 — Dashboard

- indicateurs principaux
- alertes
- état du runtime
- observations temps réel

**Statut :** ✅ Terminé

## Phase 3.4 — Topologie interactive

- équipements et liaisons
- sélection d'un équipement
- panneau de détails
- projection des états de santé

**Statut :** ✅ Terminé

## Phase 3.5 — Frontend modulaire

- navigation
- modules JavaScript spécialisés
- CSS modulaire
- timeline fondée sur les périodes métier
- responsive
- audit frontend

**Statut :** ✅ Terminé

---

# Version 1.1.0 — Infrastructure pilotée par Agent

## 3.6.1 — Contrat d'infrastructure

- modèle Pydantic strict et versionné
- ingestion par `PUT /api/infrastructure`
- validation des nœuds et services
- remplacement atomique du snapshot

**Statut :** ✅ Terminé

## 3.6.2 — Topologie complète

- équipements
- liaisons
- layouts
- références vers les nœuds
- métadonnées topologiques

**Statut :** ✅ Terminé

## 3.6.3 — Grille horizontale

- positions logiques `column` / `row`
- conversion réalisée uniquement par Vision
- calcul du canvas et des couches
- rejet des cellules dupliquées

**Statut :** ✅ Terminé

## 3.6.4 — Source de vérité unique

- suppression de la topologie codée en dur du bootstrap de production
- état vide avant synchronisation
- projection complète après réception du snapshot
- événement WebSocket `infrastructure.updated`

**Statut :** ✅ Terminé

## 3.6.5 — Résilience Agent ↔ Vision

- synchronisation obligatoire avant les observations
- retry Agent toutes les 10 secondes
- refresh toutes les 5 minutes
- suspension des observations en cas de désynchronisation
- reprise automatique après retour de Vision

**Statut :** ✅ Terminé

## 3.6.6 — Validation

- quatre scénarios d'intégration réels
- cohérence des versions CLI et OpenAPI
- hygiène du dépôt
- 745 tests

**Statut :** ✅ Terminé

---

# Version 1.2.0 — Administration graphique

L'administration reste exécutée par Ohana-Agent. Vision expose les
formulaires, les commandes et les résultats à travers les contrats publics
de l'Agent.

## 4.1 — Configuration DHCP

- consultation des paramètres du serveur DHCP
- gestion des réservations
- consultation des baux actifs
- validation explicite avant application

**Statut :** ✅ Terminé

## 4.2 — Architecture

- déplacement des équipements sur la grille
- création et modification des liaisons
- édition des équipements
- persistance des positions logiques

**Statut :** ✅ Terminé

## 4.3 — Services

- association de services aux équipements
- édition de l'implémentation et de l'activation
- gestion de la criticité
- métadonnées spécifiques aux services
- services personnalisés

**Statut :** ✅ Terminé

## 4.4 — Sécurité de l'administration

- proxy backend authentifié
- jeton Agent absent du navigateur
- découverte des capacités administrables
- confirmations avant application

**Statut :** ✅ Terminé

## 4.5 — Validation de la version

- cohérence des versions CLI, package, OpenAPI et interface
- validation des contrats Agent
- tests du proxy d'administration
- tests de l'interface graphique
- validation des ressources installables
- 754 tests

**Statut :** ✅ Terminé

---

# Version 1.3.0 — Administration des plugins

## 1.3.1 — Contrat d’administration dans Agent

- opérations `plugins.read`, `plugins.write` et `plugins.test`
- modèles versionnés pour l’état, la configuration et le résultat de test

**Statut :** ✅ Terminé

## 1.3.2 — Exposition du plugin DNS

- inventaire réel du `PluginManager`
- état, version, tâches, exécutions et configuration publique

**Statut :** ✅ Terminé

## 1.3.3 — Reconfiguration et test immédiat du DNS

- écriture atomique
- replanification sans redémarrage
- restauration en cas d’échec

**Statut :** ✅ Terminé

## 1.3.4 — Proxy d’administration dans Vision

- inventaire, lecture, modification et test
- conservation du jeton côté backend

**Statut :** ✅ Terminé

## 1.3.5 — Onglet Plugins et cartes d’état

- cartes responsive
- états actif, en attente, désactivé et dégradé
- métriques d’exécution et dernière erreur

**Statut :** ✅ Terminé

## 1.3.6 — Inspecteur et formulaires

- paramètres communs
- formulaires DNS, NTP et MQTT
- protection du mot de passe MQTT

**Statut :** ✅ Terminé

## 1.3.7 — États vides, erreurs et confirmations

- Agent non compatible
- inventaire vide ou indisponible
- confirmation avant application
- résultat du test immédiat

**Statut :** ✅ Terminé

## 1.3.8 — Tests et documentation

- tests du proxy et du frontend statique
- documentation d’utilisation et de sécurité
- 759 tests réussis

**Statut :** ✅ Terminé

## 1.3.9 — Intégration progressive

- DNS, NTP et MQTT administrables
- DHCP conservé dans son écran dédié tant qu’il n’est pas un plugin
  d’observation enregistré dans Agent

**Statut :** ✅ Terminé

---

# Version 1.4.0 — Présence réseau des équipements

## 1.4.1 — Contrat de présence

- prise en charge de la capacité `network.reachable`
- rattachement par `metadata.device_id`
- conservation des informations ICMP et ARP

**Statut :** ✅ Terminé

## 1.4.2 — Présence distincte de la santé

- observations d’équipements conservées dans l’historique
- exclusion de la timeline des services
- aucune incidence sur la santé globale

**Statut :** ✅ Terminé

## 1.4.3 — Topologie

- indicateur discret sur les équipements adressables
- états présent, absent et inconnu
- absence d’indicateur pour les équipements sans adresse IP
- légende intégrée à l’aide à la lecture

**Statut :** ✅ Terminé

## 1.4.4 — Inspecteur

- dernière vérification
- méthode de détection
- latence
- compteur d’échecs consécutifs

**Statut :** ✅ Terminé

## 1.4.5 — Tests et documentation

- tests du pipeline backend
- tests du rendu statique
- documentation du contrat et du modèle de santé
- 764 tests réussis

**Statut :** ✅ Terminé

---

# Prochaines évolutions

- historique avancé
- comparaison entre snapshots
- statistiques détaillées par capacité
- supervision multi-agents
- enrichissement progressif des opérations administrables

---

# Phase 5 — Historique et rapports

## 5.1 Timeline avancée

- zoom temporel
- navigation
- agrégation

## 5.2 Historique

- recherche
- comparaison de périodes
- évolution d'une capacité
- historique des snapshots d'infrastructure

## 5.3 Rapports

- disponibilité
- SLA
- export CSV
- export PDF

---

# Phase 6 — Sécurité et utilisateurs

- authentification
- rôles et permissions
- préférences utilisateur
- audit des actions
- notifications et Webhooks

---

# Phase 7 — Écosystème Ohana

## 7.1 Multi-agents

- enregistrement de plusieurs Agents
- vues par site
- vue consolidée
- gestion des conflits d'identifiants

## 7.2 SDK et plugins

- documentation intégrée
- contrats des plugins
- informations de capacités

## 7.3 Actions contrôlées

- diagnostics à la demande
- opérations d'administration
- suivi de l'exécution
