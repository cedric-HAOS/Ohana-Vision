# Health Model

## Objectif

L'objectif d'Ohana-Vision n'est pas uniquement d'afficher des observations.

Son rôle est de fournir une représentation claire de l'état réel de l'infrastructure.

Pour cela, les observations produites par Ohana-Agent sont transformées en un modèle de santé compréhensible par l'utilisateur.

---

# Les trois niveaux d'information

Ohana-Vision distingue trois niveaux complémentaires.

## 1. Les observations

Les observations sont les faits produits par Ohana-Agent.

Exemples :

* une résolution DNS réussie ;
* un serveur MQTT indisponible ;
* un bail DHCP attribué ;
* une sauvegarde terminée.

Les observations sont immuables.

---

## 2. L'état courant

L'état courant représente la dernière connaissance disponible pour une capacité.

Une capacité ne possède qu'un seul état courant.

Cet état évolue au fil des nouvelles observations.

---

## 3. La santé

La santé est une information de synthèse destinée à l'utilisateur.

Elle permet de répondre à une question simple :

> L'infrastructure est-elle actuellement capable de fournir les services attendus ?

---

# États de santé

Chaque capacité peut être représentée par l'un des états suivants :

* Healthy
* Degraded
* Unavailable
* Unknown
* Stale

## Healthy

La capacité fonctionne normalement.

---

## Degraded

La capacité reste disponible mais ses performances ou sa qualité de service sont dégradées.

---

## Unavailable

La capacité ne peut plus être fournie.

---

## Unknown

Aucune observation exploitable n'est disponible.

---

## Stale

La dernière observation est trop ancienne pour être considérée comme représentative de l'état actuel.

---

# Présence réseau et santé

La présence réseau répond à la question :

> L’équipement est-il actuellement visible sur le réseau ?

La santé répond à une autre question :

> Les capacités attendues sont-elles effectivement fournies ?

Un équipement peut répondre au réseau alors que ses services sont en panne. À
l’inverse, une absence temporaire peut être normale pour un équipement mobile
ou en veille. Les observations `network.reachable` ciblant un équipement sont
donc affichées séparément et ne participent pas à la santé des services, des
nœuds ou de l’infrastructure.

---

# Santé d'une capacité

Chaque capacité possède son propre état de santé.

Exemple :

| Capacité    | Santé       |
| ----------- | ----------- |
| DNS         | Healthy     |
| DHCP        | Healthy     |
| Internet    | Unavailable |
| MQTT        | Healthy     |
| Sauvegardes | Stale       |

---

# Santé d'un service

Un service peut fournir plusieurs capacités.

Sa santé est déterminée à partir de celles-ci.

Exemple :

Service DNS

* Résolution : Healthy
* Temps de réponse : Degraded
* Configuration : Healthy

Le service reste fonctionnel mais présente une dégradation.

---

# Santé d'un nœud

Un nœud regroupe plusieurs services.

Il possède également une santé globale.

Cette information permet de détecter rapidement un équipement présentant plusieurs anomalies.

---

# Santé de l'infrastructure

La santé globale de l'infrastructure est calculée à partir des capacités.

Toutes les capacités n'ont pas la même importance.

Une capacité critique indisponible peut rendre l'infrastructure globalement dégradée, même si les autres fonctionnent normalement.

Les règles exactes de calcul seront définies dans une décision d'architecture dédiée.

---

# Transitions d'état

L'évolution d'une capacité est plus importante que l'accumulation d'observations identiques.

Exemple :

08:00 Healthy

09:15 Degraded

09:42 Unavailable

09:58 Healthy

Ces transitions permettent de reconstruire l'historique des incidents.

---

# Historique

Ohana-Vision conserve :

* les observations ;
* les changements d'état ;
* les incidents calculés.

Cela permet notamment de répondre aux questions suivantes :

* Depuis quand la capacité est-elle indisponible ?
* Combien d'incidents ont eu lieu cette semaine ?
* Quelle est la durée moyenne des interruptions ?

---

# Objectifs

Le modèle de santé doit permettre :

* une compréhension immédiate de l'état de l'infrastructure ;
* une représentation cohérente des capacités ;
* une navigation simple entre l'état courant et l'historique ;
* une évolution indépendante des plugins d'Ohana-Agent.

La santé constitue la représentation métier de l'infrastructure.

Elle ne remplace jamais les observations qui en sont l'origine.
