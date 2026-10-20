/*
 * The lottery sample book: fixed settings plus a story written for the case those settings produce.
 * It is stored as the raw answer an AI chat would give, so loading it runs the same reader the
 * user's own paste goes through. Sample books can be previewed but not downloaded.
 */
(function (root) {
  'use strict';
  var LK = root.LK = root.LK || {};

  var answer = {
    titles: ['Last Ticket to Carrabay', 'The Carrabay Raffle', 'A Ticket for the Loch'],
    subtitle: 'A Murder Mystery Elimination Puzzle: 3,000 Tickets, 16 Clues, One Killer',
    blurb: 'Three thousand raffle tickets. Sixteen clues. One killer still on the island.\n\n' +
      'Every autumn the Carrabay Charity Gala fills the old hotel above the loch with music, whisky and the most talked-about raffle in the Hebrides. This year, the man who paid for it all, philanthropist Edmund Carrick, is found floating by the boathouse before the winning ticket is drawn. The police call it a drunken accident. His oldest friend knows better.\n\n' +
      'She has sent you an envelope: the complete raffle register, every ticket sold that night, and the clues she gathered from the staff and guests. Somewhere among three thousand tickets is the one the killer bought.\n\n' +
      'Work through the clues in order, cross out every ticket that does not fit, and follow the last one standing to a name. No riddles, no tricks, no guessing: just you, a pencil and the evidence. Can you finish what Edmund started?',
    keywords: ['murder mystery puzzle book for adults', 'elimination logic puzzle', 'whodunit puzzle book', 'detective game book for adults', 'logic puzzles for adults', 'mystery gift for puzzle lovers', 'find the killer puzzle'],
    setting: 'Carrabay, a small Scottish island with one ferry a day, on the night of the autumn charity gala at the Lochside Hotel.',
    victim: { name: 'Edmund Carrick', who: 'a beloved philanthropist who kept a hidden ledger of the island\'s secrets' },
    client: { name: 'Peggy Dunmore', who: 'Edmund\'s oldest friend, now under suspicion herself' },
    prologue: {
      title: 'The Night of the Draw',
      text: 'The last ferry had left Carrabay at six, and by seven the Lochside Hotel was the only bright thing on the island. Lanterns hung along the jetty. Inside, a fiddle band tuned up beneath a banner that read CARRABAY CHARITY GALA, and three long tables groaned under smoked salmon, oatcakes and a whisky donated by the island distillery.\n\n' +
        'Everyone came for the raffle. Edmund Carrick had paid for the grand prize himself, as he did every year: a restored sailing boat with a bottle of champagne lashed to the tiller. Tickets sold all evening from a booth by the door, each one logged by hand in the committee\'s register with the time, the table, the price, the way it was paid and the six lucky numbers the buyer chose. By the end of the night, three thousand of them had been sold.\n\n' +
        'Edmund was in fine form. He shook every hand, teased the minister, and made a speech so short that the room applauded it twice. Only his oldest friend, Peggy Dunmore, noticed that his smile slipped once, at a little after eight, when he looked across the ballroom and went quite still. "A ghost," he told her, when she asked. "Somebody I knew a long time ago, under another name." Then the band struck up and he was gone into the crowd.\n\n' +
        'The draw was set for half past eleven. At eleven, Edmund was missing. At a quarter past, a young waiter stepping out for air saw something pale in the black water beside the boathouse. By the time the men from the bar had waded in, there was nothing anyone could do.\n\n' +
        'Sergeant Rennie arrived on the fishing launch at dawn, read the empty glasses on the jetty and the wet planks and the cold, and wrote what everyone expected him to write: a wealthy man, a long night, a slip in the dark. Then he heard that Edmund had changed his will the week before, in Peggy\'s favor, and his questions changed with it.\n\n' +
        'Peggy knew two things the sergeant did not. Edmund never drank at his own gala. And Edmund kept a ledger, a small green book he showed to no one, in which he wrote down what he knew about people. It was not in his jacket, and it was not in his room.\n\n' +
        'Three days later, a fat envelope arrived for you on the morning ferry.'
    },
    letter: {
      text: 'Dear Detective,\n\n' +
        'Forgive the bundle. I did not know how else to send it. The police believe Edmund slipped. Some of them believe I helped him. Neither is true, and I think you are the only person who can prove it.\n\n' +
        'Inside you will find the raffle register from the gala: every ticket sold that night, as the committee wrote it down. I am certain the person who killed Edmund bought a ticket. Everyone did. It was the price of being in the room, and the killer would have been noticed if they had not.\n\n' +
        'I have spent three days talking to everyone who worked that night: the ticket sellers, the waiting staff, the band, the boatmen. Each of them remembered one small thing about the ticket the killer held. I have written their memories down as clues. Take them in order, and they will lead you to a single ticket.\n\n' +
        'The committee also kept a ledger of the guests who bought their tickets in their own names. When you have your ticket, look for it there.\n\n' +
        'Edmund once told me that people hide in plain sight because nobody reads the small print. Please read it for him.\n\n' +
        'With gratitude and hope,'
    },
    clue_notes: [
      { n: 1, note: 'Ewan, who sold tickets at the door, kept his rolls in order. The roll the killer\'s ticket came from had a faulty print wheel, and one digit never appeared on it.' },
      { n: 2, note: 'Duncan at the cash table remembers the buyer waving away the cheapest ticket with a laugh: "Nothing that small for a good cause."' },
      { n: 3, note: 'Fiona in the cloakroom glimpsed the initials on the stub as a coat changed hands, and is sure the first letter came from the front of the alphabet.' },
      { n: 4, note: 'Agnes Murray, who checked the register twice, added up the digits of every ticket as a habit. She noticed the killer\'s total was nothing remarkable.' },
      { n: 5, note: 'A torn corner of a ticket was found on the jetty. The lucky numbers that survive the tear rule out three popular picks.' },
      { n: 6, note: 'A deckhand on the launch remembers the stub because the initials were written neatly, in the order you would find them in a dictionary.' },
      { n: 7, note: 'Ewan tore the killer\'s ticket from the end of a strip, where, he says, the numbers always seem to run downhill from front to back.' },
      { n: 8, note: 'Sergeant Rennie checked both the cash box and the card machine. Neither one accounts for the killer\'s purchase.' },
      { n: 9, note: 'The seating plan pinned by the ballroom door puts the killer on the side of the room where Catriona laid the even-numbered tables.' },
      { n: 10, note: 'A water-stained stub fished from the loch shows a single surviving digit, as round and empty as a ring.' },
      { n: 11, note: 'Dr. Fraser overheard the killer joking that one lucky number was the age they had been when they first left the island.' },
      { n: 12, note: 'The band\'s set list shows the killer bought the ticket just before the long reel, when the floor was too crowded for anyone to queue.' },
      { n: 13, note: 'Catriona, the head waitress, says the killer\'s table was far from the stage, out of the reach of the spotlights.' },
      { n: 14, note: 'Kirsty sold vouchers at the door all evening. Either the killer used one of hers, or they bought late, after the speeches. Possibly both.' },
      { n: 15, note: 'Edmund\'s own notes mention the killer\'s superstition: never choose two numbers that sit side by side.' },
      { n: 16, note: 'The last clue is a pencil mark in Edmund\'s hidden ledger: a table number, smudged, but nowhere near the far wall.' }
    ],
    patrons: [
      { name: 'Alasdair Kinross', role: 'harbor master', note: 'Argued with Edmund about the new pier the morning of the gala.' },
      { name: 'Morven Leckie', role: 'owner of the island distillery', note: 'Edmund refused to invest in her new warehouse.' },
      { name: 'Isla Lennox', role: 'gala treasurer', note: 'Kept the books for every charity on the island, and never missed a penny.' },
      { name: 'Iain Fraser', role: 'island doctor', note: 'Signed the death certificate a little too quickly.' },
      { name: 'Roderick Baird', role: 'property developer from Glasgow', note: 'Wanted Edmund\'s land for a golf resort.' },
      { name: 'Elspeth Gow', role: 'Edmund\'s housekeeper', note: 'Knew where Edmund kept his ledger, or says she did not.' },
      { name: 'Callum Moffat', role: 'ferry captain', note: 'Moored his boat by the boathouse that night.' },
      { name: 'Shona MacRae', role: 'art dealer', note: 'Sold Edmund a painting he later called a fake.' },
      { name: 'Gregor Imrie', role: 'minister of the island kirk', note: 'Spoke with Edmund in private just before eleven.' },
      { name: 'Lorna Kerr', role: 'journalist from Edinburgh', note: 'Came to the island asking about a green notebook.' },
      { name: 'Torquil Bain', role: 'Edmund\'s nephew', note: 'Lost his inheritance when the will was changed.' },
      { name: 'Ailsa Drummond', role: 'owner of the Lochside Hotel', note: 'Locked the boathouse herself, or so she says.' },
      { name: 'Niall Forsyth', role: 'fisherman', note: 'Lost his boat to Edmund in a card game years ago.' },
      { name: 'Rhona Sutherland', role: 'Edmund\'s lawyer', note: 'Drafted the new will and kept quiet about it.' },
      { name: 'Fergus Lyall', role: 'retired banker', note: 'Edmund\'s chess rival for thirty years.' },
      { name: 'Kirsteen Muir', role: 'florist', note: 'Seen near the jetty with wet shoes.' },
      { name: 'Douglas Petrie', role: 'auctioneer who ran the draw', note: 'Delayed the draw without saying why.' },
      { name: 'Euan Galbraith', role: 'birdwatcher', note: 'Claims he saw a lantern moving on the loch.' },
      { name: 'Marion Abernethy', role: 'widow', note: 'Edmund paid her late husband\'s debts, and she resented it.' },
      { name: 'Struan Kelso', role: 'young piper', note: 'Played all night and saw everyone who left the room.' }
    ],
    killer: 'Isla Lennox',
    motive: 'Edmund recognized Isla as the bookkeeper behind an old charity fraud on the mainland. His ledger held the proof, and she could not let him tell the island.',
    epilogue: {
      title: 'The Small Print',
      text: 'Ticket [TICKET] was bought at eighteen minutes past nine, paid with a committee check, at a table near the back of the ballroom. In the Patron Ledger it sits beside a single name: Isla Lennox, the gala treasurer.\n\n' +
        'Nobody had looked twice at Isla. She had run the island\'s charity accounts for eleven years. She counted the cash boxes, signed the checks and wrote the thank-you letters. She had bought her ticket the way the committee always did, with a check drawn on the gala account, and she had written her own initials on the stub without a second thought. It was the one careless thing she did all night.\n\n' +
        'Edmund had known her by another name. Twenty years earlier, a children\'s charity in Inverness had collapsed when its bookkeeper vanished with the building fund. Edmund had been one of its donors. He had never forgotten the face, and at a little after eight that evening, across a crowded ballroom, he saw it again. The ghost Peggy heard him mention was standing by the raffle booth with a pencil behind her ear.\n\n' +
        'He did not make a scene. That was not his way. He wrote a line in his green ledger, finished his speech and asked Isla to meet him by the boathouse at eleven, so that she could explain before he went to the sergeant. She brought a bottle and two glasses to make it look like a friendly drink. She left with the ledger.\n\n' +
        'The police found it the next morning, after Peggy sent them your answer. It was wrapped in an oilskin under the floor of Isla\'s office, beside a mainland bank book in a name nobody on Carrabay had ever heard. The last page held Edmund\'s pencil note: her table number, and a single word, "Inverness".\n\n' +
        'Peggy Dunmore was cleared within the week. At the reopened draw a month later, the island voted to name the restored sailing boat after Edmund, and the winning ticket went to a nine-year-old girl from the harbor, who said she would use it to go and see the whole world.\n\n' +
        'People hide in plain sight, Edmund liked to say, because nobody reads the small print. You did.'
    }
  };

  LK.SAMPLES = LK.SAMPLES || {};
  LK.SAMPLES.lottery = {
    label: 'Lottery tickets: Last Ticket to Carrabay',
    project: {
      v: 1, seed: 'sample-gala', createdAt: '2026-10-01T09:00:00.000Z', sample: true,
      setup: {
        type: 'lottery', venue: 'gala', customVenue: '', tone: 'classic', ideas: '', title: '', author: 'Sample Author',
        trim: '6x9', print: 'regular', count: 3000, difficulty: 'medium', clues: 16, notesPages: 2, checkpoints: true
      },
      story: null
    },
    answer: JSON.stringify(answer)
  };
})(typeof window !== 'undefined' ? window : globalThis);
