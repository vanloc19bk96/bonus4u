/*
 * The passenger-manifest sample book: fixed settings plus a story written for the case those
 * settings produce (the cast and the sixteen clues come from the engine). It is stored as the raw
 * answer an AI chat would give, so loading it runs the same reader the user's paste goes through.
 */
(function (root) {
  'use strict';
  var LK = root.LK = root.LK || {};

  var answer = {
    titles: ['Last Night on the Halcyon', 'The Halcyon Manifest', 'Murder Below the Promenade'],
    subtitle: 'A Murder Mystery Elimination Puzzle: 3,000 Passengers, 16 Clues, One Killer',
    blurb: 'Three thousand passengers. Sixteen clues. One killer who never left the ship.\n\n' +
      'It is the autumn of 1934, and the ocean liner Halcyon is two nights out of New York on her homeward crossing when Judge Ambrose Kettering goes over the rail of the boat deck. The officers call it a sad accident. His oldest friend, Constance Pellow, knows it was murder, because the judge told her so at dinner: someone aboard was traveling under a borrowed life.\n\n' +
      'Constance cannot search three thousand cabins alone. So she has sent you the purser\'s complete passenger manifest and sixteen facts she pried loose from stewards, porters, the wireless room and the judge\'s own diary.\n\n' +
      'Cross out every passenger who does not fit, one clue at a time, until a single name is left. No riddles, no tricks, no guessing: just you, a pencil and the evidence. Can you find the killer before the Halcyon reaches Southampton?',
    keywords: ['murder mystery puzzle book for adults', 'elimination logic puzzle', 'whodunit puzzle book', 'ocean liner mystery puzzle', 'detective game book for adults', 'logic puzzles for adults', 'cozy mystery gift for puzzle lovers'],
    setting: 'The ocean liner Halcyon, on her homeward crossing of the North Atlantic in the autumn of 1934, two nights out of New York.',
    victim: { name: 'Ambrose Kettering', who: 'a retired judge famous for never changing his mind, traveling home to rewrite his will' },
    client: { name: 'Constance Pellow', who: 'the judge\'s oldest friend, who sat beside him at his last dinner' },
    prologue: {
      title: 'Two Nights Out of New York',
      text: 'The Halcyon left New York in a cold, clean wind, and by the second night out she had settled into the long rhythm of the homeward crossing. In the First Class saloon the orchestra played waltzes nobody danced to. Far below, in the Third Class dining room, a comedian named George Donovan had the whole room laughing, and a singer called Pauline Ashby was waiting for her turn at the piano.\n\n' +
        'Judge Ambrose Kettering heard none of it. He sat at the captain\'s table with his oldest friend, Constance Pellow, and told her, in the flat voice he had used for forty years on the bench, that he was going home to rewrite his will. Then he told her something else. Someone aboard, he said, was traveling under a life that was not theirs. He had seen a face at the foot of the gangway in New York that he had not seen for thirty years, and he meant to put a name to it before Southampton.\n\n' +
        'He would not say whose face. He never said anything until he was certain.\n\n' +
        'At a quarter to midnight he left the table with his diary under his arm. A merchant named Isaiah Campbell, who had lost a small fortune in a case the judge once heard, watched him go and said nothing. A journalist, Oliver Johnson, scribbled a line in his notebook. The Reverend Hector Davidson nodded to him on the stairs on his way to the late prayer service. Two engineers, Sylvia Cox and Lucille Hastings, went below with the chief to look at a turbine that had been knocking since Queenstown. And a lady\'s companion from Third Class, a quiet woman named Lorraine Calloway, carried a tray of cocoa to a passenger who could not sleep. The fog came in thick over the water.\n\n' +
        'At midnight a lookout heard a cry, short and sharp, from somewhere aft. By the time the officers reached the boat deck there was only the empty rail, the fog, and the judge\'s diary lying open on the wet boards.\n\n' +
        'By morning the captain had entered it in the log as a tragic fall. A man of seventy, a slippery deck, a night of fog. The ship could not turn back, and the line did not care for scandal. Three thousand passengers would sail on to Southampton, and whoever had stood behind the judge at that rail would walk down the gangway with them.\n\n' +
        'Constance Pellow did not believe a word of the captain\'s log. She had known Ambrose Kettering for fifty years. He had never once slipped.'
    },
    letter: {
      text: 'Dear Detective,\n\n' +
        'I am told you have a gift for patience, and patience is all I have left to offer my oldest friend. The captain will not listen. The purser, bless him, will, and he has given me a copy of the complete passenger manifest: every soul aboard the Halcyon, with ticket number, occupation, class, cabin and the port where they came up the gangway.\n\n' +
        'With it I send sixteen facts. Each one was pried loose from someone aboard: a steward with a long memory, a wireless operator, a porter in the hold, and Ambrose himself, whose diary was found by the rail. Every fact is true of the person who killed him. Not one of them is true of everybody.\n\n' +
        'Take them in order. Cross out every passenger who does not fit, and do not skip ahead, for the later facts only make sense once the crowd has thinned. When a single name is left, you will have found the face Ambrose saw in New York.\n\n' +
        'We dock at Southampton in four days. After that, the killer is a stranger on a railway platform and no one will ever know.\n\n' +
        'With gratitude and hope,'
    },
    clue_notes: [
      { n: 1, title: 'A Long Christian Name', note: 'The purser\'s clerk remembered a berth booked by telephone from New York, and a Christian name so long he had to begin the line again.' },
      { n: 2, title: 'Below the Promenade', note: 'A night steward heard hurried footsteps on the stairs just after the cry, going down past the promenade decks toward the lower ones.' },
      { n: 3, title: 'The Torn Stub', note: 'The assistant purser studied a scrap of ticket stub tucked into the judge\'s diary. Most of it was gone, but one figure was plainly absent.' },
      { n: 4, title: 'The Monogram', note: 'The ship\'s laundress kept a monogrammed handkerchief found on the boat deck, and studied its stitched letters until she was certain of this much.' },
      { n: 5, title: 'The Bell Board', note: 'The bell board in the stewards\' pantry showed which decks rang for service after the music stopped. Only a handful of them rang at all.' },
      { n: 6, title: 'Wet Ink', note: 'The judge had copied the first figure of a ticket into his diary. The ink ran in the fog, but the purser narrowed it to a handful of shapes.' },
      { n: 7, title: 'The Landing Card', note: 'A porter found half a landing card in the hold. The occupation was torn away except for one letter the clerk had written large.' },
      { n: 8, title: 'The Tender', note: 'The tender crew at the French port counted every passenger up the gangway that rainy morning, and swore none of them went near the boat deck that night.' },
      { n: 9, title: 'The Roped Stairs', note: 'The middle stairs were roped off for painting that night, and the officer on duty swore that nobody from that class slipped past him.' },
      { n: 10, title: 'The Purser\'s Sum', note: 'The purser adds up every figure he sees out of habit. He worked out what the judge\'s half-copied ticket came to, and it was modest.' },
      { n: 11, title: 'The Calling Card', note: 'Half a calling card turned up in the judge\'s pocket. Only the start of a surname survived the sea spray.' },
      { n: 12, title: 'The Telegram', note: 'The wireless operator recalled a reply-paid telegram to the judge, and a surname he typed without once touching one particular key.' },
      { n: 13, title: 'The Dance Card', note: 'A dance card found in the lounge listed partners by name. The judge had ringed one entry and pencilled a remark about its letters.' },
      { n: 14, title: 'The Luggage Label', note: 'A torn luggage label in careful capitals showed how both names ended, and a porter swore they did not end alike.' },
      { n: 15, title: 'Two Alibis', note: 'Every engineer aboard was below with the chief at the turbines, and every physician was at a sickbed until long after the cry.' },
      { n: 16, title: 'The Last Stub', note: 'Constance found the judge\'s own scrawl at last: the final figure of the ticket he meant to report, written twice and underlined.' }
    ],
    interludes: [
      { after: 4, title: 'Fog at Midnight', text: 'The purser came to the reading room with a pot of coffee and a warning. Word had spread that a lady was asking questions about the judge, and the officers did not like it. Somewhere aboard, he said quietly, someone was listening for footsteps on the stairs, the same as you. He set the coffee down and looked at the long columns of names. Thousands of them, still. But fewer than this morning.' },
      { after: 8, title: 'The Captain\'s Patience', text: 'At noon the captain sent for Constance and asked her, very politely, to stop frightening his passengers. She thanked him and asked for the bell board. He refused. Ten minutes later a steward who had served the judge his last brandy slipped it to her under a napkin. The ship, it seemed, had its own opinion of the captain\'s log.' },
      { after: 12, title: 'Faces in the Manifest', text: 'For the first time the manifest no longer looked endless. You could turn a page and see the survivors one by one: a name here, another several pages on, each one having passed every fact so far. Constance read them aloud in a low voice, as if the names themselves might flinch. One of them, she said, had smiled at Ambrose across the gangway in New York.' }
    ],
    motive: 'Ambrose Kettering was sailing home to rewrite his will and cut out the daughter he had disowned, and he had recognized her aboard, traveling under a borrowed name.',
    epilogue: {
      title: 'The Face at the Gangway',
      text: 'The last name standing was Lorraine Calloway, ticket number [ANSWER], a lady\'s companion traveling Third Class in a cabin on H deck, who had come up the gangway in New York. Constance read it twice, then closed the manifest very gently, as though it might wake someone.\n\n' +
        'Lorraine Calloway was not her name. It belonged to a companion she had worked beside years before, a woman who had died of influenza in Boston and whose papers no one had ever thought to cancel. The woman who carried them aboard the Halcyon was Ambrose Kettering\'s daughter, the child of a marriage he had spent thirty years pretending had never happened.\n\n' +
        'She had learned in the spring that he meant to rewrite his will, and that the small allowance he paid her through a lawyer would end with it. She had booked the cheapest berth on his own ship, under a dead woman\'s name, to ask him face to face for what she believed was hers. At the foot of the gangway he recognized her at a glance. He said nothing, which was worse than anything he could have said.\n\n' +
        'On the second night she carried her tray of cocoa up the back stairs, sent him a note asking him to meet her on the boat deck at midnight, and waited by the rail. He came, because he had never in his life refused to hear a case. She asked. He refused. The fog did the rest, and she was down the stairs, past the promenade decks and back to her cabin before the lookout reached the rail.\n\n' +
        'Every clue had been hers all along. The monogram she dropped by the rail. The calling card in his pocket, half washed away. The telegram she sent from the wireless room. The bell that rang from her deck long after the music stopped. And at the very last, the figure Ambrose wrote twice in his diary and underlined, because he was certain at last and meant to tell Constance in the morning.\n\n' +
        'The Halcyon docked at Southampton in a thin rain. Two policemen came up the gangway before any passenger went down, and the woman who called herself Lorraine Calloway went quietly. Constance Pellow watched from the rail where her friend had stood, and said that for once in his life Ambrose had been wrong about something: the truth had needed more than one witness after all.'
    }
  };

  LK.SAMPLES = LK.SAMPLES || {};
  LK.SAMPLES.manifest = {
    label: 'Passenger manifest: Last Night on the Halcyon',
    project: {
      v: 2, seed: 'sample-liner', createdAt: '2026-10-01T09:00:00.000Z', sample: true,
      setup: {
        type: 'manifest', venue: 'liner', customVenue: '', tone: 'classic', ideas: '', title: '', author: 'Sample Author',
        trim: '6x9', print: 'regular', count: 3000, difficulty: 'medium', clues: 16, notesPages: 2, checkpoints: true
      },
      story: null
    },
    answer: JSON.stringify(answer)
  };
})(typeof window !== 'undefined' ? window : globalThis);
