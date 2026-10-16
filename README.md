# Zero-Trace

Floute les visages et efface les métadonnées d'une photo ou d'une vidéo,
**entièrement sur l'appareil**. Pensé pour publier des images de manifestation
sans exposer les gens qu'on y voit, ni la personne qui filme.

En ligne : <https://ztrace.app>

## Ce qu'il fait

- Il lit les données cachées du fichier (lieu, date, appareil, numéro de série),
  les montre, puis les efface.
- Il trouve les visages et floute la tête entière, tout au long d'une vidéo. En
  option, il floute aussi les têtes des gens vus de dos ou de profil.
- En option, il déforme la voix d'une vidéo : toujours compréhensible, plus
  reconnaissable à l'oreille.
- Ce qu'il ne voit pas se trace au doigt ; sur une vidéo, la zone suit la
  personne sur qui on la pose.
- Il écrit un nouveau fichier, le flou inscrit dans les pixels, puis le relit
  octet par octet avant de le proposer. L'original n'est jamais modifié.

## Tout reste sur l'appareil

Aucun serveur de traitement, aucun compte, aucun cookie, aucun traceur : l'hébergeur
compte seulement les visites, de façon anonyme. Le navigateur fait tout :
la détection (ONNX Runtime en WebAssembly), le flou et le réencodage
(WebCodecs). La politique de sécurité de la page interdit toute sortie vers un
autre site, et l'application compte les tentatives à l'écran. Installée sur
l'écran d'accueil, elle marche sans réseau.

Vérifié sur iPhone (Safari, Chrome) et sur ordinateur (Chrome). Pas encore sur
Android.

## Ce qu'il ne sait pas faire

La détection n'est pas exhaustive, et c'est la limite qui compte. Il reste des
gens trop petits, trop flous, masqués, mal éclairés ou vus du dessus. La page
« Comment ça marche » de l'application liste ce qui a été vérifié et ce qui ne
l'a pas été.

**Un fichier sorti d'ici doit être regardé en entier avant d'être publié.**

## L'héberger soi-même

C'est un site statique : le dossier `app/` se sert tel quel, sans compilation.
Deux conditions :

- le servir en HTTPS (le service worker et le réencodage vidéo l'exigent) ;
- envoyer les en-têtes de `app/_headers` : l'isolation (COOP/COEP), sans
  laquelle les détecteurs ne tournent que sur un cœur, et la politique de
  sécurité.

Sur Cloudflare Pages (l'hébergement de ztrace.app) : dossier de sortie `app`,
aucune commande de build ; `app/_headers` et `app/404.html` sont pris en
compte tels quels. Sur Netlify, `netlify.toml` suffit. Ailleurs, reprendre les
en-têtes de `app/_headers` dans la configuration du serveur, et répondre 404
pour un fichier absent (un modèle manquant ne doit pas recevoir la page HTML).

Ce dépôt contient l'application telle qu'elle est servie en ligne.

## Contact

Un visage raté, un export qui bloque, une question : <contact@ztrace.app>,
avec le journal de l'application (bouton « journal », ni image ni nom de
fichier). N'envoyez jamais la vidéo elle-même. Pour un défaut dans le code,
les issues de ce dépôt sont ouvertes.

## Licence

Copyright (C) 2026 les auteurs de Zero-Trace. AGPL-3.0, voir `LICENSE`. Qui
modifie l'outil et le met en ligne doit en publier le code : un outil
d'anonymat dont on ne peut pas lire le code ne vaut rien.

Les modèles de détection, les bibliothèques et les polices viennent d'autres
auteurs, sous leurs propres licences : voir `app/vendor/LICENCES.txt`.
