# CHANGELOG

Toutes les évolutions importantes du projet sont documentées dans ce fichier.

Le projet suit les principes de Semantic Versioning.

---

# [1.11.0] — Persistance et centre d'incidents — 2026-08-10

## Ajouté

- Les observations, leurs identifiants immuables et leurs messages sont
  persistés dans SQLite et restaurés au redémarrage.
- Un Centre d'incidents ouvre, actualise et résout une dégradation continue par
  équipement, service et capacité. Il conserve l'historique, le nombre
  d'occurrences, les acquittements et les silences temporaires.
- Les opérateurs peuvent filtrer les incidents actifs ou résolus, acquitter un
  incident, suspendre ses notifications pendant une heure puis les réactiver.
- Le démarrage réconcilie les observations durables qui n'auraient pas encore
  été projetées en incident lors d'une interruption, sans doublon ni perte des
  acquittements.
- La vue Observations regroupe les évaluations identiques par équipement,
  service, capacité et statut, indique leur nombre et leur plage temporelle,
  et permet de déplier les événements bruts.
- Des filtres par statut, équipement et service facilitent l'affichage des
  seules anomalies.
- La carte Configuration / Architecture accepte désormais le zoom à la
  molette, le déplacement par glisser du fond et des commandes de zoom et de
  recentrage, sans modifier le glisser-déposer des équipements.
- Un bouton « + » permet de transformer un bail DHCP dynamique en
  réservation avec le nom, l'adresse IP et l'adresse MAC préremplis.

## Modifié

- Les replays Agent sont acceptés de manière idempotente grâce à
  `observation_id`.
- Les paliers Ethernet 5 et 8 Gbit/s sont retirés de l'éditeur de liaisons,
  de la carte Infrastructure et de sa légende ; les paliers conservés sont
  100 Mbit/s, 1, 2,5 et 10 Gbit/s.

## Qualité

- Validation visuelle du Centre d'incidents en vue bureau, incluant ouverture,
  acquittement, silence, réactivation et résolution temps réel.
- 834 tests, lint et formatage validés avant publication.

---

# [1.10.9] — Suppression des troncs radio artificiels — 2026-08-04

## Corrigé

- La carte ne génère plus de segments Wi-Fi ou Z-Wave synthétiques entre une
  passerelle et ses équipements : chaque chemin affiché correspond désormais
  exactement à une liaison déclarée dans la topologie.
- Les verticales, boucles et amorces de ligne sans liaison réelle disparaissent
  lorsque les cartes radio sont réparties sur plusieurs lignes ou colonnes.

## Qualité

- Validation visuelle locale avec 9 équipements Wi-Fi et 9 modules Z-Wave :
  18 liaisons déclarées, 18 rendues et aucun tronc radio synthétique.
- Suite complète, lint et formatage validés avant publication.
- Version du paquet alignée sur `1.10.9`.

---

# [1.10.8] — Routage radio sans liaisons artificielles — 2026-08-04

## Corrigé

- Les troncs Wi-Fi et Z-Wave conservent leur rendu pointillé, y compris pour
  leurs segments horizontaux et verticaux mutualisés.
- Les cartes radio compactes séparent désormais le badge de santé du point de
  présence afin que les deux indicateurs restent lisibles.
- Le routage ne crée plus de tronc radio intermédiaire lorsqu’une ou deux
  branches seulement partagent une direction après un déplacement de cartes.

## Qualité

- Tests ciblés du canvas topologique pour le rendu des troncs et le placement
  des indicateurs.
- Version du paquet alignée sur `1.10.8`.

---

# [1.10.7] — Modules et liaisons Z-Wave harmonisés — 2026-08-04

## Ajouté

- Le type « Module Z-Wave » est disponible dans l’éditeur Architecture et
  utilise une icône dédiée, inspirée du « Z » et des ondes de la marque, dans
  toutes les vues d’équipement et dans la configuration du plugin.

## Amélioré

- Les cartes radio compactes réservent désormais toute leur largeur au nom,
  avec réduction ou ellipse après insertion dans le SVG ; le nom complet reste
  disponible dans l’infobulle et le libellé ne dépasse plus du cadre.
- À partir de trois modules, les liaisons d’une passerelle Z-Wave partagent des
  troncs discrets par direction au lieu de superposer un éventail de chemins.
- Les liaisons Wi-Fi partagent désormais les mêmes troncs radio harmonisés que
  les modules Z-Wave, tout en conservant leur couleur propre.
- Le bandeau de supervision est recentré sur quatre indicateurs complémentaires :
  disponibilité, équipements, alertes actives et capacités supervisées.

## Corrigé

- Les modules Z-Wave découverts automatiquement sont reconnus comme supervisés
  grâce à leurs observations de santé ciblées, même sans `node_id` propre ; leur
  état contribue désormais au compteur des équipements sains.
- Les cartes redondantes Infrastructure, Services, Incidents (24 h) et Santé
  globale ont été retirées du bandeau principal.

## Qualité

- Validation visuelle dans Chromium d’un scénario à 12 modules : noms bornés,
  icône dédiée, 12 branches regroupées en 3 troncs.
- Tests statiques du type, de l’icône, du dimensionnement et du routage groupé.
- Contrôle visuel local du bandeau à quatre indicateurs, sans erreur navigateur.
- Suite complète : 813 tests réussis et Ruff sans erreur.
- Version du paquet alignée sur `1.10.7`.

---

# [1.10.6] — Positionnement explicite des équipements découverts — 2026-08-04

## Ajouté

- La page Architecture compare la configuration persistée avec la topologie
  dynamique et indique le nombre d’équipements Z-Wave restant à positionner.
- L’action « Positionner automatiquement » ajoute ces équipements et leurs
  liaisons au brouillon, autour de leur passerelle, sans modifier la carte avant
  la confirmation « Appliquer l’architecture ».

## Qualité

- Simulation du placement des 19 équipements réels d’INFRA-01 : 59 positions
  uniques et validation du brouillon par le modèle strict d’Ohana-Agent.
- Tests statiques du compteur, de l’action explicite et de sa présentation.
- Version du paquet alignée sur `1.10.6`.

---

# [1.10.5] — Correction du rendu des liaisons multiples — 2026-08-04

## Corrigé

- Le calcul des points d’ancrage utilise désormais l’équipement porté par le
  groupe de liaisons. Une passerelle reliée à plusieurs équipements, notamment
  une passerelle Z-Wave, n’interrompt plus le rendu de la topologie.

## Qualité

- Test de non-régression du dimensionnement des points d’ancrage partagés.
- Version du paquet alignée sur `1.10.5`.

---

# [1.10.4] — Groupes radio et état des nœuds Z-Wave — 2026-08-04

## Ajouté

- La carte d’infrastructure propose des commandes indépendantes pour replier
  ou déplier les groupes Wi-Fi et Z-Wave.
- Les observations ciblées `zwave.node.alive` alimentent directement la santé
  visuelle des équipements découverts par l’Agent.

## Amélioré

- Les équipements radio terminaux sont affichés sous forme de cartes compactes
  centrées sur leur icône et leur état, tout en conservant leurs informations
  complètes dans le détail et l’infobulle.
- Les liaisons Z-Wave disposent d’un style distinct et le routage s’adapte aux
  dimensions réduites des équipements.

## Qualité

- Tests statiques des groupes repliables, des cartes compactes et de la santé
  ciblée des équipements Z-Wave.
- Version du paquet alignée sur `1.10.4`.

---

# [1.10.3] — Cohérence de la carte et des plages horaires — 2026-08-04

## Corrigé

- La réception d'une observation force désormais la relecture de la timeline,
  sans attendre le délai de rafraîchissement, afin que la carte et la liste des
  observations restent cohérentes.
- La carte réconcilie la timeline avec les observations de santé plus récentes
  et ignore les observations de présence réseau réservées aux équipements.
- La reconstruction d'une fenêtre de timeline conserve l'état suspendu puis
  rouvre correctement la période lors de la reprise de la surveillance.

## Qualité

- Tests de non-régression de la carte, du rafraîchissement temps réel et des
  timelines bornées par une plage horaire.
- Version du paquet alignée sur `1.10.3`.

---

# [1.10.2] — Cohérence de la santé des services — 2026-08-02

## Corrigé

- La carte des services utilise désormais la timeline complète, comme la
  fiche équipement, au lieu de déduire la santé des 100 dernières
  observations globales.
- Les capacités et leur état restent visibles même lorsque leurs observations
  ont été évincées de la liste récente.

## Qualité

- Tests statiques ajoutés pour garantir l'usage de la timeline dans la vue
  Services.
- Version du paquet alignée sur `1.10.2`.

---

# [1.10.1] — Lecture des capacités réseau — 2026-07-31

## Amélioré

- Légende de topologie restructurée pour distinguer le type Ethernet de sa
  capacité négociée ou déclarée.
- Palette chaude à froide pour repérer immédiatement les liaisons Ethernet les
  plus lentes.
- Animation des liaisons Ethernet calibrée sur leur capacité, sans suggérer une
  mesure de trafic ou de saturation.
- Respect de la préférence système de réduction des animations.

## Qualité

- Tests statiques adaptés à la hiérarchie de légende et aux cadences par débit.
- Version du paquet alignée sur `1.10.1`.

---

# [1.10.0] — Lot C : réseau de l’Agent — 2026-07-30

## Ajouté

- Page **Configuration → Réseau Agent** affichant l’état NetworkManager réel
  d’INFRA-01.
- Formulaire IPv4 statique ou DHCP avec adresse, passerelle, DNS et délai de
  retour automatique.
- Confirmation explicite de la nouvelle configuration et restauration manuelle
  de l’ancienne configuration pendant la fenêtre de sécurité.
- Redirection vers la nouvelle adresse IPv4 lorsque l’adresse de l’hôte change.

## Sécurité

- Avertissement avant toute application et aucun accès direct de Vision à
  NetworkManager ou aux privilèges root.
- Les opérations sont proxifiées vers l’API authentifiée d’Ohana-Agent.

## Qualité

- Tests des routes de proxy, des contrôles statiques et de la navigation.
- Version du paquet alignée sur `1.10.0`.

---

# [1.9.0] — Lot B : Téléinformation directe et surveillance planifiée — 2026-07-30

## Ajouté

- Mode recommandé **Réception HTTP directe** pour le plugin Téléinformation.
- Configuration du port d’écoute, du jeton d’ingestion et de la source
  `teleinfo2mqtt` depuis la page Plugins.
- Identifiant du compteur et identifiant de source dans les services
  Téléinformation.
- Plage horaire facultative dans la fiche d’un équipement : jours, début, fin,
  fuseau horaire et délai de démarrage.
- État visuel **Suspendu** dans les cartes, détails, topologie et timeline.

## Compatibilité

- Les champs Home Assistant historiques restent accessibles dans une section de
  compatibilité pendant la migration vers l’envoi direct.
- Les équipements sans plage horaire conservent exactement leur comportement.

## Qualité

- Tests du nouvel état de santé et des contrats statiques des formulaires.
- Version du paquet alignée sur `1.9.0`.

---

# [1.8.0] — Lot A : télémétrie et formulaires de services — 2026-07-30

## Modifié

- Renommage de Shelly Telemetry en **Télémétrie Home Assistant**.
- Migration automatique des services `shelly_telemetry` affichés dans l’éditeur.
- Champ **Hôte ou adresse IP** acceptant les noms DNS.
- Champ Port affiché uniquement pour les types de service qui permettent une surcharge.

---

# v1.7.1 — Validation des noms DHCP — 2026-07-29

## Corrigé

- Validation immédiate des noms d’hôte dans le formulaire de réservation DHCP.
- Message explicite lorsque le caractère `_`, un espace ou un autre caractère
  incompatible DNS est utilisé.
- Suggestion automatique utilisant un tiret, par exemple
  `esp-lave_vaiselle` → `esp-lave-vaiselle`.
- Contrôle de l’ensemble des réservations avant l’envoi vers Agent.
- Signalement visuel des réservations au nom invalide dans le tableau DHCP.
- Ajustement automatique de la taille des noms d’équipements longs dans la
  topologie afin qu’ils restent à l’intérieur de leur carte.
- Troncature de secours avec conservation du nom complet dans l’infobulle SVG
  pour les libellés exceptionnellement longs.

## Qualité

- Validation frontend alignée sur le contrat `DHCPReservation` d’Ohana-Agent.
- Version du paquet alignée sur `1.7.1`.

# v1.7.0 — Téléinformation Linky — 2026-07-29

## Ajouté

- Support graphique du plugin Agent `teleinformation`.
- Type de service **Téléinformation** dans l’éditeur d’architecture.
- Champs dédiés à `SINSTS`, `NTARF` et aux index Tempo `EASF01` à `EASF06`.
- Paramétrage de la connexion Home Assistant et test immédiat depuis la page
  Plugins.
- Icône officielle de compteur dans les cartes Plugins et Services.
- Activation du plugin pilotée par la présence d’un service sur RPI-Linky.

## Qualité

- Tests statiques complétés pour les formulaires Architecture et Plugins.
- Version du paquet alignée sur `1.7.0`.

# v1.6.3 — Fluidité et cohérence visuelle — 2026-07-29

## Corrigé

- Le compteur de tâches des plugins est rechargé immédiatement après
  l’application d’une architecture, notamment pour Shelly Telemetry.
- Les vues Architecture, Infrastructure, Services et détails utilisent désormais
  les mêmes icônes officielles pour tous les types d’équipements.
- Les liaisons pleines affichent un flux lumineux animé lors de la sélection
  d’un équipement, tandis que les liaisons pointillées conservent leur
  animation existante.
- La grille de configuration passe à 15 colonnes et 10 lignes.
- L’API et la page Observations ne renvoient plus que les 100 observations les
  plus récentes.
- Les rafales d’observations WebSocket sont regroupées afin d’éviter les
  rechargements concurrents et les rendus inutiles des vues masquées.
- La timeline est actualisée au maximum toutes les cinq secondes et ne traite
  plus que les dernières 24 heures, avec conservation de l’état antérieur
  nécessaire au début de la plage.
- La page Plugins recharge ses compteurs à chaque ouverture.

## Qualité

- 796 tests réussis et syntaxe JavaScript validée.
- Version du paquet alignée sur `1.6.3`.

# v1.6.2 — Services et Shelly Telemetry — 2026-07-28

## Ajouté

- Nouvelle page **Services** dans la section Supervision, placée sous
  Infrastructure.
- Carte logique regroupant les services par équipement hôte, avec leur état,
  leur type, leur criticité et le nombre de capacités observées.
- Filtres par texte, état, type et criticité.
- Inspecteur de service avec l’équipement hôte, l’adresse, l’implémentation, la
  dernière observation et le détail des capacités.
- Accès direct depuis la carte des services vers l’équipement correspondant
  dans la topologie physique.
- Paramètres d'export Home Assistant dans le formulaire du plugin MQTT :
  activation, MQTT Discovery, préfixe Discovery, topic racine et battement.

## Corrigé

- Le paramétrage Shelly Telemetry a été retiré des propriétés générales des
  équipements.
- Le type de service `Shelly Telemetry` est disponible dans l’éditeur de
  l’architecture.
- Chaque service permet de saisir l’entité de puissance, l’entité d’énergie
  facultative, l’âge maximal, l’activation et la criticité.
- La page globale du plugin conserve uniquement la connexion à Home Assistant.

## Qualité

- Version du paquet alignée sur `1.6.2`.
- 784 tests réussis et syntaxe JavaScript validée.

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
- La liste globale des équipements Shelly est supprimée de la page Plugins.
  Shelly Telemetry se configure désormais directement dans la fiche de chaque
  équipement de l’architecture.

## Ajouté

- Version d’Ohana-Agent affichée sous la version d’Ohana-Vision dans la barre
  latérale.
- Prise en compte directe de la criticité des services déclarés dans
  l’infrastructure pour les alertes du dashboard.
- Indication du serveur WebSocket Z-Wave JS sur le port 3000 dans le formulaire
  du plugin.
- Champs par équipement pour activer Shelly Telemetry et renseigner les entités
  Home Assistant de puissance et d’énergie.

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
