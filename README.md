# Ohana-Vision

> Visualiser l'état réel d'une infrastructure pilotée par capacités.

Ohana-Vision est l'interface web de l'écosystème Ohana.

Il reçoit d'Ohana-Agent deux flux complémentaires :

- un **snapshot complet d'infrastructure** décrivant les nœuds, services, équipements, liaisons et positions logiques ;
- les **observations dynamiques** décrivant l'état réel des capacités dans le temps.

Ohana-Agent reste la source de vérité de la configuration. Ohana-Vision valide, projette, historise et affiche les données reçues.

---

## Principes

Ohana-Vision ne collecte aucune donnée directement sur l'infrastructure.

Il ne dialogue ni avec les équipements ni avec les services supervisés. Il s'appuie exclusivement sur les contrats publics d'Ohana-Agent afin de présenter :

- l'état courant des capacités ;
- la santé des services et des nœuds ;
- la topologie de l'infrastructure ;
- l'historique des périodes de fonctionnement ;
- les observations reçues en temps réel.

La définition statique répond à la question **« qu'est-ce qui existe ? »**. Les observations répondent à la question **« comment cela fonctionne-t-il ? »**.

---

## Fonctionnalités

### Dashboard

La vue d'ensemble regroupe :

- les indicateurs principaux ;
- les alertes actives, y compris celles issues d’une capacité critique ;
- l'état global du runtime ;
- la topologie de l'infrastructure ;
- la timeline des périodes métier.

La barre latérale affiche la version de Vision ainsi que la version réellement
exposée par l’API d’administration d’Agent.

### Topologie dynamique

La topologie n'est plus codée en dur dans Vision.

Au démarrage, Vision expose un état vide jusqu'à la réception du snapshot Agent. Après synchronisation, il affiche :

- les équipements ;
- les liaisons ;
- les nœuds supervisés ;
- les adresses ;
- les services associés ;
- l'état de santé ;
- le panneau de détails.

Les positions sont transmises sous forme de cellules logiques `column` / `row`. Vision reste seul responsable de leur conversion en coordonnées graphiques, des espacements et des dimensions du canvas.

### Carte des services

La page **Services**, située sous Infrastructure, fournit une projection logique
complémentaire à la topologie physique. Elle regroupe les services par
équipement hôte et affiche directement :

- leur état courant calculé depuis les dernières observations de chaque
  capacité ;
- leur type, leur port et leur implémentation ;
- leur criticité ;
- le nombre de capacités observées et celles en anomalie ;
- la date de la dernière observation.

La page propose une recherche et des filtres par état, type et criticité. Un
inspecteur détaille le service sélectionné et permet de retrouver son
équipement dans la carte Infrastructure.

Dans l'éditeur d'architecture, le champ **Groupe de disponibilité** associe les
instances redondantes d'un même service logique. Les DNS utilisent `dns` par
défaut : une panne partielle est dégradée et l'indisponibilité n'est déclarée
que lorsque toutes les instances du groupe sont en échec.

### Santé de l'hôte Agent

La page **Supervision / Hôte** reprend le snapshot `host.health` produit par
Agent. Elle présente l'état synthétique de la machine, CPU, charge normalisée,
mémoire, swap, disque racine, température lorsqu'elle est disponible, uptimes
hôte et Agent, redémarrages Agent et diagnostics systemd. Les durées sont
affichées sous forme compacte, par exemple `8 j 19 h 29 min`.

Le cockpit associe l'état sain, dégradé ou critique à un grand pictogramme
dédié, sans score numérique. Des jauges contextualisent les ressources
principales tandis que la disponibilité et le diagnostic restent lisibles en
un coup d'œil.

### Timeline

La timeline repose sur les périodes métier calculées par le backend.

Le navigateur ne regroupe jamais les observations. Chaque ligne représente un nœud et chaque segment une période d'état produite par le `TimelineEngine`.

### Observations

Les observations reçues en temps réel sont persistées dans SQLite et restaurées
au redémarrage. Elles présentent notamment :

- la date ;
- la capacité ;
- le service ;
- le nœud ;
- l'état ;
- la latence ;
- les métadonnées.

### Centre d'incidents

La page **Incidents** suit chaque dégradation continue d'une capacité jusqu'à
sa résolution. Elle regroupe le contexte de l'équipement et du service, le
statut, le message, les dates et le nombre d'occurrences. Un opérateur peut
acquitter un incident ou rendre ses notifications silencieuses pendant une
heure ; ces décisions restent persistantes après un redémarrage.

En production, observations et incidents utilisent par défaut
`/var/lib/ohana-vision/vision.db`, configurable avec
`storage.database_path` dans `vision.yaml`.

### Configuration graphique

La section **Configuration** permet d'administrer l'infrastructure sans ouvrir
ni modifier de fichier YAML :

- **Réseau Agent** : lecture de NetworkManager, configuration IPv4 et
  confirmation protégée par un retour automatique ;
- **Baux DHCP** : plage dynamique, passerelle, DNS, NTP, durée des baux,
  réservations et consultation des baux actifs ;
- **Architecture** : cartographie sur grille, déplacement par glisser-déposer,
  indication des équipements Z-Wave découverts restant à positionner,
  positionnement automatique explicite, association des services aux
  équipements et création des liaisons en sélectionnant leur source puis leur
  destination ;
- **Plugins** : état, activation, configuration et test immédiat des plugins
  Sauvegardes HAOS, DHCP, DNS, NTP, MQTT, présence réseau, Z-Wave, WireGuard Freebox et
  Télémétrie Home Assistant et Téléinformation réellement enregistrés dans Ohana-Agent.

La version 1.10.0 ajoute la page **Réseau Agent**. Elle ne dispose d’aucun
privilège système : elle présente le formulaire et suit la reconnexion, tandis
qu’Agent applique ou restaure la connexion NetworkManager via son helper limité.

Vision présente et valide les formulaires, puis transmet la demande à l’API
locale authentifiée d'Ohana-Agent. L'Agent reste seul propriétaire des fichiers
et applique ses validations métier avant toute écriture.

Les équipements Z-Wave découverts ne sont jamais ajoutés automatiquement à la
carte persistée. La page Architecture affiche leur nombre, prépare leur
placement autour de la passerelle sur demande, puis attend l’action
**Appliquer l’architecture** avant toute écriture dans la configuration Agent.
Le type **Module Z-Wave** leur attribue une icône radio dédiée. Dans la carte,
leurs noms restent bornés aux cartes compactes et les liaisons d’une même
passerelle sont regroupées sur des troncs communs afin de limiter
l’enchevêtrement visuel.

Le mode **Déplacer** modifie les cellules logiques `row` / `column`. Le mode
**Relier** permet de créer une liaison entre n'importe quels équipements
(box, commutateur, point d'accès, serveur ou passerelle). Une liaison existante
est sélectionnable pour modifier ses extrémités, sa technologie, son sens et
son débit. Le guide complet se trouve dans
[`docs/Administration.md`](docs/Administration.md).

### Temps réel

Le WebSocket actualise automatiquement :

- les KPI ;
- la topologie ;
- la timeline ;
- la liste des observations.

La réception d'un nouveau snapshot émet également l'événement `infrastructure.updated`.

---

## Intégration avec Ohana-Agent

Le contrat principal est :

```text
Ohana-Agent
    ├── PUT  /api/infrastructure
    └── POST /api/observations
             ↓
Ohana-Vision
    ├── validation stricte
    ├── projection de topologie
    ├── stockage des observations
    ├── calcul de santé
    └── timeline métier
```

Vision accepte un snapshot complet par :

```http
PUT /api/infrastructure
```

Réponse attendue :

```text
200 OK
```

Les observations sont reçues par :

```http
POST /api/observations
```

L'Agent attend que Vision accepte le snapshot avant de démarrer les observations. Il retente la synchronisation toutes les 10 secondes et renouvelle le snapshot toutes les 5 minutes. Si Vision devient indisponible, les observations sont suspendues jusqu'à la resynchronisation.

Le détail du contrat et des scénarios d'exploitation se trouve dans [`INTEGRATION.md`](INTEGRATION.md).

---

## Architecture

Le frontend est volontairement modulaire :

```text
app.js
        │
        ▼
ApplicationController
        │
        ├── DashboardController
        ├── NavigationController
        ├── TopologyController
        ├── ServicesController
        ├── TimelineController
        ├── ObservationsController
        ├── IncidentsController
        ├── ConfigurationController
        ├── DeviceDetailsController
        └── WebSocketController
```

Les données partagées sont centralisées dans `application_state.js`.

Le frontend reste un moteur de rendu. La validation, les projections, la santé et la timeline sont calculées côté backend.

---

## API principales

| Méthode | Endpoint | Rôle |
|---|---|---|
| `PUT` | `/api/infrastructure` | Remplacer le snapshot courant |
| `POST` | `/api/observations` | Ingérer une observation |
| `GET` | `/api/incidents` | Lire les incidents actifs ou résolus |
| `POST` | `/api/incidents/{id}/acknowledge` | Acquitter un incident |
| `POST/DELETE` | `/api/incidents/{id}/silence` | Suspendre ou réactiver ses notifications |
| `GET` | `/api/topology` | Lire la topologie projetée |
| `GET` | `/api/timeline` | Lire les périodes métier |
| `GET` | `/api/runtime` | Lire l'état du runtime |
| `GET` | `/api/administration/capabilities` | Lire les opérations Agent disponibles |
| `GET/PUT` | `/api/administration/network` | Lire ou modifier le réseau de l’Agent |
| `POST` | `/api/administration/network/{id}/confirm` | Confirmer une modification réseau |
| `POST` | `/api/administration/network/{id}/rollback` | Restaurer l’ancienne configuration |
| `GET/PUT` | `/api/administration/dhcp` | Lire ou modifier le serveur DHCP |
| `GET/PUT` | `/api/administration/infrastructure` | Lire ou modifier l'architecture |
| `GET` | `/api/administration/plugins` | Lister les plugins Agent |
| `GET/PUT` | `/api/administration/plugins/{id}` | Lire ou modifier un plugin |
| `POST` | `/api/administration/plugins/{id}/test` | Tester immédiatement un plugin |
| WebSocket | `/ws` | Recevoir les mises à jour temps réel |

La documentation OpenAPI est disponible sur `/docs` lorsque son exposition est activée dans la configuration.

---

## Technologies

- Python 3.13
- FastAPI
- Pydantic
- JavaScript ES Modules
- HTML5
- CSS modulaire
- WebSocket

---

## Structure

```text
src/
    ohana_vision/
        topology/
        web/
            api/
            routers/
            static/

tests/
docs/
scripts/
```

Le frontend est organisé par responsabilités dans `web/static/styles/`.

---

## Développement

Installer le projet et ses dépendances de développement :

```bash
pip install -e ".[dev]"
```

Lancer le serveur :

```bash
uvicorn ohana_vision.web.bootstrap:build_application --factory --reload
```

Ou utiliser la CLI :

```bash
ohana-vision --config config/vision.yaml
```

Accéder au tableau de bord :

```text
http://127.0.0.1:8000/ui/
```

---

## Tests et qualité

```bash
python -m pytest
python -m ruff check .
```

État validé pour la v1.9.0 :

```text
799 tests passent
```

Les scénarios d'intégration réels ont également été validés :

1. Vision démarre avant Agent ;
2. Agent démarre avant Vision ;
3. Vision disparaît puis redémarre ;
4. Agent s'arrête proprement pendant une attente de synchronisation.

---

## État actuel

La version **1.9.0** affiche la présence réseau des équipements déclarés dans
l’infrastructure et disposant d’une adresse IPv4 ou d’un nom DNS. Elle interprète
les observations `network.reachable` produites par Ohana-Agent sans transformer
Vision en outil de supervision réseau généraliste. Elle présente également le
plugin générique **Télémétrie Home Assistant** et masque le champ Port lorsque le
type de service n’autorise pas de surcharge locale.

La topologie conserve ses badges de santé fonctionnelle et ajoute un indicateur
plus discret pour la présence : **Présent**, **Absent** ou **Inconnu**.
L’inspecteur d’un équipement affiche la dernière vérification, la méthode, la
latence et le nombre d’échecs consécutifs.

Les observations ciblant directement un équipement restent consultables dans
l’historique, mais elles n’entrent pas dans la timeline des services ni dans le
calcul de santé globale.

Vision continue également d’assurer l’administration graphique du DHCP, de
l’architecture, des services et des plugins DNS, NTP et MQTT à travers l’API
d’Ohana-Agent. Le jeton d’administration reste exclusivement utilisé par le
backend de Vision.

La version 1.9.0 ajoute également la réception Téléinformation directe et les plages horaires de surveillance au niveau des équipements.

Les prochaines évolutions concerneront principalement l'historique avancé,
l'amélioration des capacités administrables et la supervision multi-agents.
### Téléinformation Linky

L’éditeur d’architecture rattache un service `teleinformation` au RPI-Linky et
demande l’identifiant du compteur ainsi que l’identifiant de source. La page
Plugins configure le récepteur HTTP dédié d’Agent : adresse d’écoute, port et
jeton d’ingestion. `teleinfo2mqtt` peut alors envoyer chaque trame directement
vers Agent, indépendamment de Home Assistant et du broker de HA-Green.

Le mode Home Assistant et ses entités `SINSTS`, `NTARF` et `EASF01` à `EASF06`
restent disponibles dans une section de compatibilité pendant la migration.

### Plages horaires

La fiche d’un équipement peut définir une plage de surveillance avec ses jours,
son fuseau horaire et un délai de démarrage. En dehors de cette plage, les
services et la présence réseau hérités affichent **Suspendu**. Cet état reste
visible dans la timeline sans être compté comme incident ou dégradation.
