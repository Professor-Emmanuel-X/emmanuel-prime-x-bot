# EMMANUEL PRIME X BOT

Bot WhatsApp multi-appareils écrit en JavaScript avec Baileys. Il inclut un **site web protégé par mot de passe** qui génère le code de pairing, et il est prêt à être déployé sur **Render**.

- Propriétaire : PROFESSOR EMMANUEL X
- Numéro du bot et du owner : 242056749511
- Telegram : https://t.me/emmanuelprimex

## Ce que contient le projet

- **Site de pairing** : page de connexion (identifiant + mot de passe), puis formulaire où l'on entre son numéro pour recevoir le code de pairing. Chaque numéro lié a sa propre session et ses propres réglages.
- **238 commandes**. Tape `.menu` pour les voir toutes.
- **IA** via OpenRouter : GPT, Gemini, Claude, DeepSeek, Llama, Mistral, analyse d'image, chatbot automatique, etc.
- **Protection de groupe** : anti-lien, anti-mots interdits, avertissements, bienvenue, mode AFK, classement des membres actifs.
- **Musique d'ambiance** sur le site (voir plus bas).
- La photo du bot est utilisée dans le menu, dans `.alive`, dans le message de connexion et sur le site. Sur la session principale (242056749511), elle devient aussi la photo de profil au premier lancement.

## 1. Mettre le projet sur GitHub

Crée un dépôt vide sur GitHub, puis dans le dossier du projet :

```bash
git init
git add .
git commit -m "EMMANUEL PRIME X BOT"
git branch -M main
git remote add origin https://github.com/TON-PSEUDO/emmanuel-prime-x-bot.git
git push -u origin main
```

Le fichier `.env` est ignoré par Git : ta clé API ne sera pas publiée. Pense à mettre le dépôt en **privé** : les identifiants du site ont une valeur par défaut dans `config.js`.

## 2. Déployer sur Render

1. Va sur https://render.com puis **New +**, **Web Service**, et connecte ton dépôt GitHub.
2. Les réglages sont déjà dans `render.yaml` :
   - Runtime : Node
   - Build command : `npm install`
   - Start command : `npm start`
3. Dans **Environment**, ajoute ces variables :

| Variable | Rôle |
| --- | --- |
| `OPENROUTER_API_KEY` | Ta clé OpenRouter (commandes IA) |
| `SITE_LOGIN` | Identifiant pour entrer sur le site |
| `SITE_PASSWORD` | Mot de passe pour entrer sur le site |
| `ADMIN_LOGIN` | Identifiant de l'espace admin (`/admin`) |
| `ADMIN_PASSWORD` | Mot de passe de l'espace admin (différent de celui du site). Tant qu'il n'est pas défini, `/admin` est désactivé |
| `YT_COOKIES` | (facultatif) cookies YouTube au format JSON, si `.play` est bloqué par YouTube |
| `COBALT_API`, `COBALT_KEY` | (facultatif) ton instance Cobalt pour les téléchargements |
| `REPO_URL` | (facultatif) lien de ton dépôt, affiché par `.script` |

4. Clique sur **Create Web Service**. Quand l'état passe à « Live », ouvre l'adresse Render : c'est ton site de pairing.

## 3. Lier ton WhatsApp

1. Ouvre le site et connecte-toi.
2. Entre ton numéro au format international, sans le `+` (exemple : `242056749511`).
3. Copie le code à 8 caractères.
4. Dans WhatsApp : **Réglages, Appareils connectés, Connecter un appareil, Connecter avec un numéro de téléphone**, puis saisis le code.
5. Le bot t'envoie un message de confirmation. Tape `.menu`.

### Si WhatsApp répond « Impossible de connecter l'appareil »

Le site affiche maintenant l'état de la liaison en direct sous le code (en attente, liaison en cours, connecté, ou la raison de l'échec). Vérifie dans l'ordre :

1. Le numéro saisi sur le site est **celui du téléphone** où tu entres le code (indicatif + numéro, sans `+`).
2. Tu utilises le **dernier** code affiché : chaque nouveau clic sur « Obtenir mon code » annule le précédent.
3. Tu le saisis dans les **4 minutes** (après, le code expire et le site te le dit).
4. Sur Render, le service est bien **Live** (pas en train de démarrer). Dans les **Logs**, cherche les lignes `[pair ...]` : elles disent si le code a été généré, validé ou refusé.
5. Si le code est refusé en boucle (401), supprime les anciens appareils liés dans WhatsApp, puis redemande un code.

## Vérifier que les commandes marchent

Tape `.apitest` (owner) : le bot teste depuis Render chaque service utilisé par les commandes (musique, images, Facebook, Instagram, IA…) et dit lesquels répondent. Si un service est en panne, la commande concernée passe automatiquement au suivant.

## Messages de bienvenue et d'au revoir

- `.welcome on/off` et `.goodbye on/off` activent chaque message séparément.
- `.setwelcome texte` et `.setgoodbye texte` les personnalisent. Variables : `@user`, `@group`, `@count`, `@desc`, `@prefix`.
- `.testwelcome` montre un aperçu, `.resetwelcome` / `.resetgoodbye` remettent le texte par défaut.

## Gérer les appareils connectés (admin)

- **Depuis le site** : ouvre `/admin` (bouton « Admin » en haut du site), connecte-toi avec `ADMIN_LOGIN` et `ADMIN_PASSWORD`. Tu vois tous les numéros liés au bot, leur état et leur durée de connexion, et tu peux en supprimer. La personne est prévenue sur WhatsApp et l'appareil disparaît de sa liste « Appareils connectés ».
- **Depuis WhatsApp** (numéro principal uniquement) : `.sessions` liste les appareils, `.sessions delete 242XXXXXXXXX` en supprime un.

## 4. Ajouter la musique du site

Le site peut jouer un morceau en boucle (lecteur en bas à droite, avec pause et volume).

1. Place ton fichier audio dans `public/music/` et nomme-le exactement **`la-vida-carousel.mp3`**.
2. Envoie-le sur GitHub avec le reste (`git add .`, `git commit`, `git push`).

Tant que ce fichier n'existe pas, aucun lecteur n'apparaît et le site fonctionne normalement. Les navigateurs bloquent la lecture automatique : la musique démarre au premier clic ou à la première touche du visiteur. Utilise un morceau dont tu as les droits, surtout si ton site est public.

## Important : la session WhatsApp sur Render

Sur le plan **gratuit** de Render, le disque est éphémère. À chaque redéploiement ou redémarrage complet, la session WhatsApp est perdue et il faut refaire le pairing. Pour la conserver, il faut un plan payant avec un **Disk** monté sur `/var/data` et la variable `DATA_DIR=/var/data` (exemple en commentaire dans `render.yaml`).

Le plan gratuit endort aussi le service après 15 minutes sans visite. Le bot s'envoie un ping toutes les 10 minutes pour rester éveillé.

## Lancer en local

```bash
cp .env.example .env    # puis remplis les valeurs
npm install
npm start               # http://localhost:3000
```

## Ajouter une commande

Crée un fichier dans `commands/` :

```js
module.exports = {
  name: 'salut',
  aliases: ['hello'],
  category: 'fun',   // main, ai, group, tools, download, fun, owner, media, search, anime
  async run(ctx) {
    await ctx.reply(`Salut @${ctx.senderNum} !`);
  }
};
```

Options possibles : `owner: true`, `group: true`, `admin: true`, `botAdmin: true`, `private: true`.
Si tu crées une nouvelle catégorie, ajoute-la aussi dans la liste `CATS` de `commands/main.js`, sinon elle n'apparaîtra pas dans le menu.

## Sécurité

- Ne mets jamais ta clé API ou ton mot de passe dans un dépôt public : utilise les variables d'environnement.
- Le site bloque une adresse pendant 10 minutes après 5 mauvais mots de passe.
- Les commandes sensibles (`.restart`, `.sessions`) sont réservées à l'owner principal, car le serveur est partagé entre toutes les sessions.
