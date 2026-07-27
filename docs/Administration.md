# Administration graphique

Ohana-Vision 1.3.0 permet d'administrer le DHCP, l'architecture et les plugins
intégrés sans modifier directement les fichiers YAML. Vision présente les
formulaires et transmet les changements à l'API locale authentifiée
d'Ohana-Agent. Agent valide, écrit et applique seul la configuration.

## Ouvrir la configuration

1. Ouvrir `http://ADRESSE_DU_SERVEUR:8000`.
2. Choisir **Configuration** dans la barre latérale.
3. Choisir **Baux DHCP**, **Architecture** ou **Plugins**.

Les onglets indisponibles sont désactivés selon les capacités réellement
annoncées par l'Agent.

## Administrer les plugins

L'onglet **Plugins** présente les plugins réellement enregistrés dans
Ohana-Agent. La version 1.3.0 prend en charge DNS, NTP et MQTT.

Chaque carte indique :

- l'état actif, désactivé, en attente ou dégradé ;
- la version ;
- le nombre de tâches et d'exécutions ;
- la dernière exécution ;
- la dernière erreur connue.

La sélection d'une carte ouvre l'inspecteur. Il permet de :

- activer ou désactiver le plugin ;
- modifier son intervalle, son délai maximal et ses tentatives ;
- modifier les paramètres propres à DNS, NTP ou MQTT ;
- appliquer la configuration après confirmation ;
- lancer un test immédiat et consulter son résultat.

Les services DNS, NTP et MQTT ciblés restent déclarés dans l'onglet
**Architecture**. Les formulaires de plugins ne dupliquent pas leurs adresses.

Le mot de passe MQTT n'est jamais affiché. Lorsque le champ est laissé vide,
Agent conserve le secret déjà enregistré.

DHCP reste administré dans l'onglet **Baux DHCP**. Il n'est pas présenté comme
un plugin tant qu'Agent ne dispose pas d'un véritable plugin d'observation DHCP.

## Cartographier les équipements

La vue Architecture représente chaque équipement dans une cellule de grille.

1. Activer le mode **Déplacer**.
2. Faire glisser un équipement vers la cellule souhaitée.
3. Si la cellule est occupée, les deux équipements échangent leur position.
4. Cliquer sur **Appliquer l'architecture** pour rendre les positions
   persistantes.

Les coordonnées enregistrées restent les cellules logiques `column` et `row`.
Le navigateur calcule seul les coordonnées d'affichage.

## Gérer les services

1. Cliquer sur l'équipement qui héberge le service.
2. Vérifier son adresse IP.
3. Dans **Services associés**, choisir un service ou cliquer sur
   **Ajouter un service**.
4. Renseigner le type, le port, l'implémentation, l'activation et la criticité.
5. Enregistrer le brouillon puis appliquer l'architecture.

Un service est rattaché au nœud de l'équipement sélectionné. Un équipement doit
donc avoir une adresse IP avant de pouvoir héberger un service.

## Créer ou modifier une liaison

1. Activer le mode **Relier**.
2. Cliquer sur l'équipement source.
3. Cliquer sur l'équipement de destination.
4. Compléter la technologie, le sens, le débit et le libellé dans l'inspecteur.
5. Enregistrer puis appliquer l'architecture.

Cliquer directement sur une ligne existante ouvre le même inspecteur. La source
et la destination peuvent être changées : un équipement peut ainsi être relié
à la box, à un commutateur déterminé, à un point d'accès ou à tout autre
équipement déclaré.

## États et erreurs

L'interface distingue :

- Agent ne proposant pas l'administration des plugins ;
- aucun plugin enregistré ;
- erreur de chargement de l'inventaire ;
- configuration refusée par Agent ;
- test réussi, échoué ou impossible.

Une modification refusée laisse le formulaire affiché et présente le message
retourné par Agent.

## Sécurité et validation

- le jeton Agent n'est jamais envoyé au navigateur ;
- toute application complète demande confirmation ;
- Vision ne lit et n'écrit aucun fichier de configuration de plugin ;
- Agent refuse les documents invalides ;
- les écritures sont atomiques et la configuration précédente est restaurée en
  cas d'échec d'application ;
- les secrets MQTT ne transitent jamais vers le navigateur.
