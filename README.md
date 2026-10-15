# Last Hand

Last Hand is a real-time card showdown for 2–8 players. Choose elimination or a fixed-length series, pick five cards, use one of three power-ups, and climb the points table.

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
- Each player sees three random power-ups per hand and may choose one. Sabotage secretly removes one unplayed rival card, Spyglass privately reveals three random cards, and Royal Decree changes one card to a Queen, King, or Ace. Other powers double scoring, add three cards, make a chosen suit wild, or treat the highest card as an Ace.
- The round target starts at 150 and drops by 10 each round, to a minimum of 100. Scores at or above it receive a 15-point bonus. The host can set each hand to 30, 45, 60, or 90 seconds, or turn the timer off. Unlocked hands auto-pick five cards when time expires.
- Choose elimination mode to remove the lowest scorer after each hand, or series mode to keep everyone playing for 3, 5, 7, or 10 hands and award the match to the highest cumulative score. After each hand, the table ranks players by cumulative points. Seats show each player around the felt, and used powers animate after everyone locks in.
- At the end of a match, the host can return to the same room and start a fresh game. Any player can exit the room.
- A guided dealer-bot tutorial highlights the table, target, hand, power-up, and play button. Cards animate when dealt and selected, then reveal in poker-hand scoring order.
- The home screen opens when you revisit the site. Use the profile icon to set your name and view your wins and losses; the profile is stored in that browser.
