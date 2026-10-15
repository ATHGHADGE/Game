# Last Hand

Last Hand is a real-time card showdown for 2–8 players. Players join with a room code, pick five cards, use a random one-use power-up, and try not to finish last. The lowest score is eliminated each round; the final survivor wins.

## Run locally

Requires Node.js 18 or later. From this folder, run:

```sh
npm start
```

Then open `http://localhost:3000`. To play with people on the same network, they can open the host computer's local network address on port 3000. For people on other networks, deploy the app to a Node.js web host.

## Deploy to Render

The included `render.yaml` configures a single-instance Node web service. Push this folder to a GitHub repository, create a new Blueprint in Render from that repository, and deploy. Render will provide a public HTTPS URL to share. Rooms are held in server memory, so an app restart ends active games; deploy one instance for this version.

## Rules

- 2–8 people join the host's room code. The host starts once at least two have joined.
- Each active player gets eight cards, then chooses five. Poker hand rankings determine the base score.
- Each player receives one random power-up each round. Double Down doubles the score, Mulligan adds three cards to choose from, Wild Suit makes the played cards count as one chosen suit, and Ace Up treats the highest selected card as an Ace.
- The round target starts at 150 and drops by 10 each round, to a minimum of 100. Scores at or above the target receive a 15-point bonus.
- After everyone locks in, the lowest score is eliminated. A tie for lowest is broken randomly. Eliminated players spectate until one player remains.
- At the end of a match, the host can return to the same room and start a fresh game. Any player can exit the room.
- A guided dealer-bot tutorial highlights the table, target, hand, power-up, and play button. Cards animate when dealt and selected, then reveal in poker-hand scoring order.
- The home screen opens when you revisit the site. Use the profile icon to set your name and view your wins and losses; the profile is stored in that browser.
