# Administration graphique

Ohana-Vision 1.10.0 permet d’administrer le réseau de l’Agent, le DHCP, l’architecture et les plugins
intégrés sans modifier directement les fichiers YAML. Vision présente les
formulaires et transmet les changements à l'API locale authentifiée
d'Ohana-Agent. Agent valide, écrit et applique seul la configuration.

## Ouvrir la configuration

1. Ouvrir `http://ADRESSE_DU_SERVEUR:8000`.
2. Choisir **Configuration** dans la barre latérale.
3. Choisir **Réseau Agent**, **Baux DHCP**, **Architecture** ou **Plugins**.

Les onglets indisponibles sont désactivés selon les capacités réellement
annoncées par l'Agent.

## Administrer le réseau d’INFRA-01

La page **Réseau Agent** lit l’état NetworkManager exposé par Agent :
interface active, nom de connexion, adresse IPv4, passerelle, DNS et mode DHCP
ou statique.

Pour modifier la connexion :

1. saisir la nouvelle configuration et choisir un délai de retour ;
2. confirmer l’avertissement ;
3. laisser Vision appliquer la configuration par l’intermédiaire d’Agent ;
4. se reconnecter à la nouvelle adresse si nécessaire ;
5. cliquer sur **Confirmer la nouvelle adresse** avant l’expiration du délai.

Sans confirmation, Agent restaure automatiquement l’ancienne connexion. Le
bouton **Restaurer maintenant** permet de déclencher cette restauration sans
attendre. Vision n’accède jamais directement à `nmcli`, `sudo` ou aux fichiers
NetworkManager.

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
2. Vérifier son hôte ou son adresse IP.
3. Dans **Services associés**, choisir un service ou cliquer sur
   **Ajouter un service**.
4. Renseigner le type, les options affichées pour ce type, l'implémentation, l'activation et la criticité.
5. Enregistrer le brouillon puis appliquer l'architecture.

Un service est rattaché au nœud de l'équipement sélectionné. Un équipement doit
donc avoir une adresse IPv4 ou un nom DNS avant de pouvoir héberger un service.

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

## Gérer les workers et le Wake-on-LAN

L'onglet **Workers** conserve Agent comme source de vérité. Vision affiche :

- l'état `AVAILABLE`, `UNAVAILABLE` ou `WAKING` calculé par Agent ;
- la MAC Wake-on-LAN annoncée par Katsuyu ;
- la provenance et la date du dernier réveil ;
- la dernière connexion et les capacités du worker ;
- la politique WOL effective : activation, broadcast, port et délais.

Lorsque le Wake-on-LAN est activé, qu'une MAC est connue et que le worker est
`UNAVAILABLE`, **Tester le réveil** demande à Agent/Tsunade d'envoyer un seul
Magic Packet. Vision n'envoie jamais elle-même de paquet réseau et ne stocke
aucune copie de la MAC ou de la politique WOL.

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
- une modification réseau conserve l’ancienne connexion jusqu’à confirmation
  ou restauration automatique ;
- Vision ne lit et n'écrit aucun fichier de configuration de plugin ;
- Agent refuse les documents invalides ;
- les écritures sont atomiques et la configuration précédente est restaurée en
  cas d'échec d'application ;
- les secrets MQTT ne transitent jamais vers le navigateur.
