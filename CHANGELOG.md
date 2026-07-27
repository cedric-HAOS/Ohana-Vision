# CHANGELOG

Toutes les évolutions importantes du projet sont documentées dans ce fichier.

Le projet suit les principes de Semantic Versioning.

---

# v1.3.0 — Administration des plugins — 2026-07-27

## Ajouté

- Onglet **Plugins** dans la section Configuration.
- Cartes d’état pour les plugins DNS, NTP et MQTT enregistrés dans Agent.
- Inspecteur affichant version, capacités, planification, exécutions et dernière
  erreur.
- Formulaires spécialisés pour DNS, NTP et MQTT.
- Activation, désactivation et reconfiguration à chaud après confirmation.
- Test immédiat avec résultat, message et latence.
- États vides, indisponibles, dégradés et erreurs d’application.
- Proxy backend pour l’inventaire, la lecture, l’écriture et le test des plugins.

## Sécurité

- Aucun fichier YAML de plugin n’est lu ou écrit par Vision.
- Le jeton d’administration reste exclusivement dans le backend.
- Le mot de passe MQTT n’est jamais affiché et une saisie vide conserve le
  secret existant.

## Qualité

- 759 tests réussis.
- Syntaxe des modules JavaScript validée avec Node.js.
- Construction validée des artefacts wheel et sdist 1.3.0.

# v1.2.0 — Administration graphique — 2026-07-24

## Ajouté

- Nouvelle section **Configuration** cohérente avec l'interface Vision.
- Écran **Baux DHCP** pour les paramètres du serveur, les réservations et les
  baux actifs.
- Cartographie **Architecture** sur grille avec déplacement des équipements
  par glisser-déposer et persistance des positions `row` / `column`.
- Mode **Relier** en deux clics, sélection et édition graphique des liaisons.
- Édition de la source, de la destination, de la technologie, du sens et du
  débit d'une liaison existante.
- Association et édition des services directement depuis leur équipement.
- Gestion graphique des services DNS, DHCP, MQTT, NTP, Home Assistant,
  Z-Wave, téléinformation et services personnalisés.
- Découverte des capacités réellement proposées par Ohana-Agent.
- Proxy backend authentifié : le jeton Agent n'est jamais exposé au navigateur.
- Confirmations explicites avant l'application d'une configuration.

## Modifié

- Le contrat d'infrastructure transporte désormais l'implémentation,
  l'activation, la criticité et les métadonnées de chaque service.

---

# v1.1.2 — Ressources graphiques installables

## Corrigé

- Inclusion des icônes et logos de l'interface dans les artefacts Python.
- Ajout du manifeste web référencé par l'interface.
- Redirection de l'URL racine vers `/ui/`.
- Ajout de contrôles de packaging pour éviter une nouvelle release incomplète.

---

# v1.1.1 — Nommage Ohana cohérent

## Modifié

- Harmonisation du nom du projet, du package et des commandes avec `Ohana`.
- Préparation d'artefacts `ohana_vision` distincts de la release `v1.1.0`
  publiée avec l'ancien nom.
- Alignement de la version affichée dans l'interface sur la version du package.
- Modernisation des métadonnées de licence du package.

---

# v1.1.0 — Infrastructure dynamique pilotée par Ohana-Agent

## Ajouté

### Contrat d'infrastructure

- Endpoint `PUT /api/infrastructure`.
- Modèles Pydantic stricts et versionnés.
- Validation des nœuds, services, équipements, liaisons et layouts.
- Réponse typée indiquant le nombre de nœuds et de services acceptés.
- Événement WebSocket `infrastructure.updated`.

### Topologie complète

- Réception des équipements et de leurs métadonnées.
- Réception des liaisons, directions et bandes passantes.
- Réception des layouts et des positions logiques.
- Association des équipements aux nœuds supervisés.
- Projection des services dans les métadonnées des équipements.

### Grille horizontale

- Positions exprimées en `column` / `row`.
- Conversion en coordonnées graphiques réalisée par Vision.
- Calcul automatique des dimensions du canvas.
- Rejet des cellules de grille dupliquées.

### État initial

- Topologie vide `unconfigured` avant la première synchronisation.
- Message d'attente explicite dans l'interface.

---

## Modifié

### Source de vérité

- Ohana-Agent devient propriétaire de la définition de l'infrastructure et de la topologie.
- Vision ne lit aucune copie de `infrastructure.yaml`.
- Le snapshot reçu remplace atomiquement la définition précédente.

### Bootstrap

- Suppression du chargement de la topologie Ohana-House codée en dur en production.
- Conservation du constructeur historique uniquement pour les tests ciblés.

### Interface

- Rafraîchissement automatique de la topologie après l'événement `infrastructure.updated`.
- Conservation du rendu horizontal et responsive existant.

### Version

- Alignement de la version CLI, du package, de FastAPI et d'OpenAPI sur `1.1.0`.

---

## Intégration

Les scénarios suivants ont été validés de bout en bout avec Ohana-Agent :

1. Vision démarre avant Agent ;
2. Agent démarre avant Vision ;
3. Vision devient indisponible puis redémarre ;
4. Agent s'arrête proprement pendant une attente de synchronisation.

L'Agent suspend les observations tant que Vision n'a pas accepté le snapshot, puis les reprend automatiquement après resynchronisation.

---

## Qualité

- 745 tests passent.
- Validation complète du contrat Agent → Vision.
- Validation des références et des identifiants.
- Nettoyage des métadonnées `egg-info` et des fichiers temporaires suivis par Git.
- Contrôle Ruff et tests complets réussis.

---

# v0.4.0 — Frontend modulaire et Timeline métier

## Ajouté

### Frontend modulaire

- Découpage complet du JavaScript en modules spécialisés.
- Introduction d'un `ApplicationController` responsable de l'orchestration.
- Centralisation de l'état partagé dans `application_state.js`.
- Séparation des contrôleurs :
  - Dashboard
  - Navigation
  - Topologie
  - Timeline
  - Observations
  - Détails des équipements
  - WebSocket

### CSS modulaire

Découpage complet de la feuille de style en modules indépendants :

- foundations.css
- layout.css
- components.css
- dashboard.css
- topology.css
- timeline.css
- observations.css
- device-details.css
- responsive.css

### Navigation

- Navigation latérale entièrement modulaire.
- Synchronisation avec l'URL (`location.hash`).
- Conservation de la vue active.
- Vue d'ensemble regroupant dashboard, topologie et timeline.

### Timeline

Refonte complète de la timeline.

Le frontend n'utilise plus les observations pour reconstruire l'historique.

La timeline repose désormais sur les périodes métier calculées par le backend.

Ajouts :

- modèle JavaScript `TimelinePeriod`
- rendu par périodes
- compteur de périodes
- affichage des périodes par nœud
- simplification importante du contrôleur Timeline

### Dashboard

- restauration complète de la vue d'ensemble
- intégration de la topologie
- intégration de la timeline
- amélioration du responsive
- optimisation des proportions du tableau de bord

### Qualité

- suppression du code mort
- suppression des anciens styles de timeline
- suppression des anciens regroupements d'observations
- suppression des logs JavaScript de production
- amélioration des messages d'erreur utilisateur

---

## Modifié

### Architecture Frontend

Le frontend devient un moteur de visualisation.

Toute la logique métier est désormais calculée côté backend.

Le navigateur ne reconstruit plus les modèles métier.

### Timeline

Abandon définitif du pipeline :

```
Observation
    ↓
Javascript
    ↓
Regroupement
```

au profit de :

```
Observation
    ↓
TimelineEngine
    ↓
StatePeriod
    ↓
API
    ↓
TimelinePeriod
    ↓
Frontend
```

### Interface

- amélioration de la disposition générale
- meilleure séparation des responsabilités
- simplification de la navigation
- amélioration de la cohérence visuelle

---

## Supprimé

- ancien rendu fondé sur les observations
- `renderEvent()`
- `renderRow()`
- `groupObservationsByNode()`
- `groupPeriodsByNode()`
- `isObservationVisible()`
- styles `timeline-event`
- compteur d'événements
- logs JavaScript de production

---

## Qualité

- 620 tests unitaires
- validation complète du responsive
- audit du frontend
- audit du CSS
- audit de la timeline
- audit d'hygiène du dépôt
