# CHANGELOG

Toutes les évolutions importantes du projet sont documentées dans ce fichier.

Le projet suit les principes de Semantic Versioning.

---

# v1.6.1 — Santé critique et versions — 2026-07-28

## Corrigé

- Le statut métier `unavailable` est maintenant normalisé en état critique dans
  tous les KPI, comme il l’était déjà dans la topologie.
- Les capacités rattachées à un service critique influencent désormais les KPI
  de santé globale, de disponibilité, d’alertes et d’incidents.
- Les observations sont regroupées par nœud, service et capacité afin d’éviter
  les collisions entre capacités portant le même identifiant.
- Le délai d’administration par défaut passe à 10 secondes pour permettre les
  tests de plugins avec nouvelle tentative.

## Ajouté

- Version d’Ohana-Agent affichée sous la version d’Ohana-Vision dans la barre
  latérale.
- Prise en compte directe de la criticité des services déclarés dans
  l’infrastructure pour les alertes du dashboard.
- Indication du serveur WebSocket Z-Wave JS sur le port 3000 dans le formulaire
  du plugin.

## Qualité

- Version du paquet alignée sur `1.6.1`.
- Tests statiques ajoutés pour la version Agent et la propagation des capacités
  critiques dans les KPI.
- 779 tests réussis et syntaxe JavaScript validée.

---

# v1.6.0 — Freebox WireGuard et Shelly Telemetry — 2026-07-27

## Corrigé

- Le formulaire WireGuard ne propose plus le contrôle d’une interface locale ni l’âge d’un échange.
- La configuration correspond maintenant au serveur WireGuard réellement fourni par la Freebox.

## Ajouté

- Configuration de l’identifiant d’application, de la version, du jeton Freebox et de la vérification TLS.
- Carte et formulaire **Shelly Telemetry**.
- Configuration de l’URL Home Assistant, du jeton, de l’âge maximal et de la liste des équipements Shelly.
- Saisie d’une ligne par équipement sous la forme `Nom | capteur de puissance | compteur d’énergie facultatif`.

## Qualité

- 775 tests unitaires, API et statiques réussis.
- Vérification syntaxique du JavaScript de configuration.

---

# v1.5.0 — Plugins Z-Wave et WireGuard — 2026-07-27

## Corrigé

- La page **Observations** affiche désormais toute la liste disponible dans sa zone défilante au lieu de la limiter aux six derniers éléments.

## Ajouté

- Prise en charge des plugins **Z-Wave** et **WireGuard** dans la page Plugins.
- Formulaire Z-Wave avec activation de la vérification TLS.
- Formulaire WireGuard avec contrôle optionnel de l’âge du dernier échange.
- Type de service **WireGuard** dans l’éditeur d’architecture.
- Icônes officielles pour les deux nouveaux plugins.

## Qualité

- 775 tests unitaires, API et statiques réussis.
- Tests statiques ajoutés pour la liste complète des observations et les nouveaux formulaires de plugins.

# v1.4.4 — Configuration par équipement et finitions UI — 2026-07-27

## Corrigé

- L’activation de la présence réseau est désormais définie sur chaque
  équipement adressable dans la page **Architecture**.
- Le plugin réseau conserve ses paramètres globaux de fréquence, délai et
  seuil, sans proposer le bouton d’activation par équipement dans son
  inspecteur.
- La page **Observations** occupe toute la hauteur disponible et fait défiler uniquement la liste.
- L’information technique **Nœud** a été retirée de la carte de détail d’un équipement.

## Modifié

- La page **Architecture** adopte un véritable espace de travail plein écran
  avec une cartographie extensible et un inspecteur latéral indépendant.
- La page **Plugins** utilise une disposition maître-détail plus lisible :
  liste compacte à gauche et inspecteur principal à droite.
- Les équipements dont la présence réseau est désactivée ne présentent plus
  d’indicateur de présence dans la topologie.

## Qualité

- Tests statiques et tests de construction de la configuration réseau adaptés
  au réglage `metadata.network_presence_enabled`.

# v1.4.3 — Vue d’ensemble et navigation de configuration — 2026-07-27

## Modifié

- La vue d’ensemble place désormais l’état courant de l’infrastructure à droite
  de la topologie.
- Le panneau latéral n’affiche que le dernier état connu de chaque nœud et
  dispose d’un défilement vertical lorsque la liste dépasse la hauteur
  disponible.
- La topologie utilise toute la hauteur restante sous les indicateurs.
- Les pages **DHCP**, **Architecture** et **Plugins** sont maintenant accessibles
  directement depuis le menu **Configuration**, sans onglets internes.

## Ajouté

- Le formulaire d’un équipement permet de renseigner son rôle.
- Le rôle est conservé dans `topology.devices[].metadata.role` et reste affiché
  dans la carte et l’inspecteur de l’équipement.

## Qualité

- Tests statiques adaptés à la navigation séparée, au rôle d’équipement et au
  mode compact de la timeline.

# v1.4.2 — Configuration réseau et DHCP — 2026-07-27

## Corrigé

- La présence réseau peut être désactivée depuis l’onglet **Plugins** sans que
  les champs obligatoires du formulaire empêchent l’application de
  `enabled: false`.
- Le formulaire de présence réseau expose désormais le seuil d’échecs avant
  de déclarer un équipement absent.
- L’onglet **Baux DHCP** reste accessible lorsque l’administration DHCP est
  indisponible ou non exposée par Agent ; un état explicite remplace la
  désactivation complète de l’onglet.
- Les contrôles DHCP sont protégés tant que la configuration n’est pas chargée.
- Le nouveau plugin d’observation DHCP utilise un formulaire conforme au modèle
  strict d’Agent, sans champ `retries` non supporté.

## Qualité

- Tests statiques ajoutés pour la désactivation de la présence réseau,
  l’accessibilité du panneau DHCP et le formulaire du plugin DHCP.

# v1.4.0 — Présence réseau des équipements — 2026-07-27

## Ajouté

- Interprétation des observations `network.reachable` produites par
  Ohana-Agent.
- Rattachement de la dernière observation à l’équipement grâce à
  `metadata.device_id`.
- Indicateur de présence discret sur les cartes des équipements adressables.
- États **Présent**, **Absent** et **Inconnu**, indépendants de la santé des
  services.
- Détails de la dernière vérification dans l’inspecteur : date, méthode,
  latence et échecs consécutifs.
- État inconnu explicite pour les équipements ayant une adresse IP mais encore
  aucune observation de présence.

## Modifié

- Les observations ciblant un équipement (`target_type: device`) sont
  conservées dans l’historique mais exclues de la timeline et du calcul de
  santé globale.
- Le chargement de la topologie réutilise désormais la timeline et les
  observations déjà présentes dans l’état frontend.
- Les événements WebSocket actualisent uniquement les ressources concernées :
  les observations ne rechargent plus la définition de la topologie ni
  l’éditeur d’architecture.

## Corrigé

- Suppression du clignotement périodique de la carte lorsque les observations
  conservent le même état visuel.
- Protection des formulaires d’administration en cours de saisie contre les
  rafraîchissements automatiques provoqués par les observations.

## Qualité

- 767 tests réussis.
- Syntaxe des modules JavaScript validée avec Node.js.
- Construction validée des artefacts wheel et sdist 1.4.0.

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
