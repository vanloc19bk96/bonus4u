/*
 * Name pools for archives that list people (manifests, guest registers, staff rosters, guest lists),
 * and the letter facts the name clues read. Names use plain letters A-Z only, so counting letters
 * is never ambiguous for the reader. Combinations that spell a famous person are never made.
 */
(function (root) {
  'use strict';
  var LK = root.LK = root.LK || {};

  function words(s) { return s.split(/\s+/).filter(Boolean); }

  var FIRST = {
    classic: words(
      'Ada Agnes Alice Alma Amelia Anna Audrey Beatrice Bernice Bertha Betty Blanche Bonnie Caroline Catherine Cecilia ' +
      'Clara Constance Cora Daisy Della Diana Dolores Dora Doris Dorothy Edith Edna Eleanor Elsie Emma Esther Ethel Eva ' +
      'Evelyn Faye Florence Frances Georgia Geraldine Gertrude Gladys Grace Hattie Hazel Helen Henrietta Ida Irene Iris ' +
      'Isabel Ivy Jean Josephine Joyce Julia June Laura Lena Lillian Lois Lorraine Louise Lucille Lydia Mabel Madeline ' +
      'Margaret Marian Martha Maude Mildred Minnie Miriam Nancy Nell Nora Olive Opal Pauline Pearl Phyllis Rita Rose Ruth ' +
      'Sadie Sylvia Thelma Vera Viola Violet Virginia Vivian Wilma Winifred ' +
      'Albert Alfred Archibald Arnold Arthur Barnaby Basil Benjamin Bernard Calvin Cecil Charles Chester Clarence Claude ' +
      'Clifford Clyde Conrad Cyril Douglas Edgar Edmund Edward Edwin Elmer Ernest Eugene Everett Felix Floyd Francis Frank ' +
      'Frederick George Gerald Gilbert Gordon Harold Harvey Henry Herbert Horace Howard Hugh Irving Jasper Julian Kenneth ' +
      'Lawrence Leonard Leslie Lewis Lionel Louis Malcolm Martin Maurice Melvin Milton Montague Morris Neville Norman Oliver ' +
      'Oscar Percy Philip Ralph Raymond Reginald Roland Rupert Russell Samuel Sidney Stanley Theodore Thomas Victor Vincent ' +
      'Wallace Walter Warren Wilfred William ' +
      'Adele Alberta Amy Annie Antoinette Augusta Beatrix Belle Bessie Camille Carlotta Celia Charlotte Christine Claudia ' +
      'Cleo Colleen Cordelia Daphne Dinah Dulcie Eileen Elaine Eliza Ella Ellen Eloise Enid Estelle Etta Eunice Flora Freda ' +
      'Georgina Greta Gwendolyn Harriet Helena Hester Honor Imogen Jane Janet Jessie Juliet Kathleen Kitty Leonora Lettie ' +
      'Lila Lottie Lucy Mae Maisie Marcella Margery Marjorie Matilda May Millie Mona Muriel Myrtle Nina Norma Octavia Peggy ' +
      'Philippa Prudence Queenie Rhoda Rosalind Rosemary Selma Stella Susannah Tabitha Theodora Ursula Verity Winnie Yvonne Zelda ' +
      'Abel Ambrose Amos Angus Anthony Augustus Bartholomew Bertram Bruce Byron Cedric Cornelius Cuthbert Dennis Desmond ' +
      'Dudley Duncan Elias Elliot Emmett Ezra Ferdinand Gideon Godfrey Gregory Hamish Hector Humphrey Isaiah Jerome Jethro ' +
      'Joel Jonah Laurence Leo Leopold Lucian Matthias Mortimer Nathaniel Ned Nigel Orson Otis Otto Phineas Quentin Randolph ' +
      'Rex Roderick Rufus Septimus Silas Simon Solomon Stuart Thaddeus Tobias Vernon Virgil Wendell Wilbur Willard Winston'),
    modern: words(
      'Abigail Addison Aisha Alexa Allison Amber Andrea Angela Ashley Aubrey Bailey Brianna Brooke Caitlin Camila Carly ' +
      'Chloe Claire Courtney Danielle Delaney Emily Erin Fiona Gabriela Hailey Hannah Harper Heather Holly Isla Jasmine ' +
      'Jenna Jessica Jillian Kayla Kelsey Kendra Kimberly Lauren Leah Lindsay Mackenzie Madison Maya Megan Melanie Mia ' +
      'Molly Monica Natalie Nicole Olivia Paige Piper Priya Rachel Rebecca Riley Samantha Sara Savannah Sienna Sofia ' +
      'Stephanie Summer Tamara Taylor Tessa Vanessa Whitney Zoe ' +
      'Aaron Adam Adrian Aiden Andre Austin Blake Brandon Brendan Caleb Cameron Carlos Chase Cody Colin Connor Damian ' +
      'Derek Diego Dominic Dylan Elijah Eric Ethan Evan Garrett Gavin Grant Hunter Ian Isaac Jacob Jared Jason Javier ' +
      'Joshua Justin Kevin Kyle Landon Logan Lucas Marcus Mason Mateo Miles Nathan Noah Omar Owen Parker Patrick Preston ' +
      'Rafael Ryan Sean Seth Shane Spencer Trevor Tristan Tyler Wesley Xavier Zachary ' +
      'Alana Alicia Ana Ariana Ava Bella Bianca Brenda Carmen Cassidy Celeste Chelsea Dana Elena Elsa Faith Gemma Gina Hope ' +
      'Imani Jade Jada Kara Keira Lana Layla Lily Lola Lucia Luna Mara Maria Marisa Nadia Naomi Phoebe Quinn Raven Reese Rosa ' +
      'Ruby Selena Serena Skye Talia Tara Tiana Valerie Willow Yasmin Zara ' +
      'Alex Andrew Asher Axel Beau Bennett Bradley Brody Bryce Carson Casey Cole Corey Dante Darius Declan Devin Easton Eli ' +
      'Finn Gabriel Graham Grayson Harrison Hayden Hugo Ivan Jake Jude Kai Keegan Liam Levi Luca Luke Malik Max Micah Nolan ' +
      'Paxton Reid Roman Rowan Ryder Santiago Theo Troy Wade Zane')
  };
  function uniq(arr) { var seen = {}; return arr.filter(function (w) { if (seen[w]) return false; seen[w] = true; return true; }); }
  FIRST.classic = uniq(FIRST.classic);
  FIRST.modern = uniq(FIRST.modern);

  var LAST = words(
    'Abbott Adams Ainsworth Archer Ashby Atkins Bailey Baker Barker Barnes Barton Bates Baxter Beckett Bell Bennett ' +
    'Bishop Black Blackwood Blake Booth Bradley Brooks Brown Burke Burton Butler Byrne Calloway Campbell Carlisle Carr ' +
    'Carter Chambers Chapman Clarke Clayton Cole Collins Cook Cooper Crane Cross Cullen Curtis Dalton Dashwood Davies ' +
    'Dawson Dean Delaney Dixon Doyle Drake Duncan Dunn Edwards Elliott Ellis Emerson Evans Everly Fairfax Farrell Fenn ' +
    'Fielding Finch Fisher Fleming Ford Forsyth Foster Fox Frost Fuller Gallagher Gardner Garrett Gibson Gilbert Gordon ' +
    'Graham Granger Grant Gray Green Griffin Hale Hall Hamilton Hammond Harding Hargrove Harper Harris Hart Harvey ' +
    'Hawkins Hayes Henderson Hill Hobbs Holland Hollis Hopkins Howard Hudson Hughes Hunt Hunter Ingram Irwin Jackson ' +
    'James Jenkins Johnson Jones Jordan Kane Keane Keller Kelly Kennedy Kerr King Kingsley Knight Lambert Lane Langley ' +
    'Lawrence Lawson Lee Lennox Lewis Lloyd Lockwood Long Lowe Lucas Lynch Lyons Mack Mann Marsh Marshall Martin Mason ' +
    'Matthews Maxwell May Mercer Merritt Miller Mills Mitchell Monroe Moore Morgan Morris Murphy Murray Nash Newman ' +
    'Nichols Noble Norris North Oakley Osborne Owen Palmer Parker Parsons Patel Payne Pearce Pemberton Perry Phillips ' +
    'Pierce Porter Potter Powell Pratt Prentice Prescott Price Quinn Radcliffe Ramsey Reed Reid Reynolds Rhodes Rice ' +
    'Richards Riley Roberts Robinson Rogers Ross Rowe Russell Rutherford Ryan Sanders Saunders Sayer Scott Sharp Shaw ' +
    'Shelton Simmons Simpson Sinclair Slater Smith Spencer Stanley Steele Sterling Stevens Stewart Stone Sullivan Sutton ' +
    'Swift Talbot Taylor Tennant Thomas Thompson Thorne Thornton Todd Tucker Turner Upton Vance Vaughan Voss Wade Walker ' +
    'Wallace Walsh Walton Ward Warren Watson Watts Webb Webster Wells West Wheeler Whitaker White Whitman Wilkins ' +
    'Williams Willis Wilson Winslow Winter Wood Woods Wright Wyatt Yardley Yates Young ' +
    'Acton Alden Allan Ames Arden Armstrong Arnold Austin Avery Ayers Bain Banks Barlow Barrett Bartlett Bean Beard Bentley ' +
    'Berry Bird Blair Bolton Bowen Bowman Boyd Brennan Briggs Bright Brock Bryant Buckley Bull Burgess Burns Bush Cain ' +
    'Caldwell Carver Case Chandler Clifford Cobb Coleman Conway Cox Craig Crawford Crosby Cunningham Dale Daly Davidson ' +
    'Dennis Dodd Donovan Douglas Dudley Dyer Eaton Emery Fitzgerald Flynn Forbes Fowler Francis Franklin Freeman Gale ' +
    'Garner Gates Gill Glover Goodwin Gough Greer Gregory Guthrie Hadley Hancock Hanson Hardy Harlow Harmon Hartley ' +
    'Hastings Hatcher Haynes Healy Heath Hendricks Hewitt Hicks Higgins Hodges Hogan Holden Holt Hood Hooper Horton ' +
    'Houston Howell Hubbard Hurst Hutchins Jarvis Jennings Joyce Judd Keating Kemp Kent Kirby Lamb Larkin Lindsay Logan ' +
    'Lord Lyle Madden Maddox Malone Manning Marsden Mayhew Meadows Merrick Moss Munro Nelson Newton Nolan Norman Nugent ' +
    'Oliver Ormond Parrish Patton Peck Penrose Pickering Pike Platt Pope Prior Pryce Randall Rawlings Raymond Redmond ' +
    'Ritter Rollins Rooney Rowland Rudd Rutledge Salter Sawyer Sexton Shepherd Sherwood Shields Short Sims Snow Sparks ' +
    'Spence Stafford Stark Stokes Strand Strong Summers Sweeney Tanner Tate Thatcher Tierney Townsend Tracy Trent ' +
    'Underwood Vale Vernon Vickers Wainwright Walters Ware Warner Weaver Whitfield Winters Woodward York');
  // English place-style surnames (Ashford, Blackwell, Thornbury...) widen the pool for big lists
  var ROOTS = words('Ash Black Brad Brook Clay Cold Fair Fox Hart Hay Kings Lang Lock Mar Mill Moor North Oak Rock Rose ' +
    'Salt Stan Thorn West Whit Wood Wren Ald Bel Cran Elm East South Wake Win Hol Dun Pen');
  var ENDS = words('ford field wood ley ton worth by well ham wick more dale brook stead bury croft hurst');
  LAST = uniq(LAST);
  var curated = {};
  LAST.forEach(function (w) { curated[w] = true; });
  var LAST_X = [];
  ROOTS.forEach(function (r) {
    ENDS.forEach(function (e) {
      var s = r + e;
      if (/(.)\1\1/.test(s.toLowerCase()) || r.slice(-1).toLowerCase() === e[0] || curated[s] || (e === 'more' && /r$/.test(r))) return;
      LAST_X.push(s);
    });
  });
  var ALL_LAST = LAST.concat(LAST_X);
  // a surname as a register would show it: mostly common names, some place names
  function randomLast(rng) { return rng.next() < 0.85 ? LAST[rng.int(LAST.length)] : LAST_X[rng.int(LAST_X.length)]; }

  // Full names that belong to famous people or famous fictional characters: never generated.
  var FAMOUS = words(
    'GraceKelly HowardHughes DorisDay HenryFord WalterWhite ClaraBarton BettyWhite HaroldLloyd ArthurMiller WalterScott ' +
    'RoseKennedy EthelKennedy EdwardKennedy GeorgeMichael CharlesDarwin ThomasMore OscarWilde OliverStone EmmaStone ' +
    'GeorgeFord HenryJames AliceWalker AdamSmith JohnSmith JessicaJones LucasGrant IsaacNewton NoahWebster ' +
    'LauraIngalls MartinLuther EdithPiaf DianaRoss MiaFarrow EricClapton RyanReynolds KevinBacon ChloeKelly ' +
    'TaylorSwift HarperLee BrookeShields CalvinHarris SamuelJackson AaronPaul NathanFillion SeanConnery ' +
    'OliverCromwell ThomasCromwell HarrisonFord GeraldFord BettyFord IanFleming EmmaWatson KevinHart MaxPayne MayWest MaeWest ' +
    'AdamWest RoseWest BradleyCooper AliceCooper DylanThomas OwenWilson LukeWilson HelenHunt IsaacHayes NormanBates ' +
    'MarthaStewart PatrickStewart JosephineBaker ColinBaker GraceJones CaseyJones EmmaThompson RyanGosling ' +
    'HughGrant LukePerry MartinFreeman FaithHill LaurenHill RachelGreen NancyWheeler MarthaJones EthanHunt LilyEvans WadeWilson');
  var famousSet = new Set(FAMOUS.map(function (s) { return s.toUpperCase(); }));

  function isFamous(first, last) { return famousSet.has((first + last).toUpperCase()); }

  function pool(era) {
    if (era === 'mixed') return FIRST.classic.concat(FIRST.modern);
    return FIRST[era] || FIRST.classic;
  }

  // ---------- letter facts ----------
  var VOWELS = 'AEIOU';
  function upper(s) { return String(s).toUpperCase().replace(/[^A-Z]/g, ''); }
  function maskOf(s) {
    var m = 0;
    for (var i = 0; i < s.length; i++) m |= 1 << (s.charCodeAt(i) - 65);
    return m;
  }
  function popcount(m) { var n = 0; while (m) { m &= m - 1; n++; } return n; }
  function vowelCount(s) { var n = 0; for (var i = 0; i < s.length; i++) if (VOWELS.indexOf(s[i]) !== -1) n++; return n; }
  function hasDouble(s) { for (var i = 1; i < s.length; i++) if (s[i] === s[i - 1]) return true; return false; }
  // how many different letters appear more than once (MERRITT: R and T, so 2)
  function repeatedKinds(s) {
    var seen = {}, rep = {};
    for (var i = 0; i < s.length; i++) { if (seen[s[i]]) rep[s[i]] = true; seen[s[i]] = true; }
    return Object.keys(rep).length;
  }

  // Facts about one word, cached on a hidden key so thousands of clue tests stay fast.
  var cache = new Map();
  function facts(word) {
    var hit = cache.get(word);
    if (hit) return hit;
    var u = upper(word);
    var f = { u: u, len: u.length, first: u[0] || '', last: u[u.length - 1] || '', mask: maskOf(u), vowels: vowelCount(u),
      dbl: hasDouble(u), rep: repeatedKinds(u) };
    f.kinds = popcount(f.mask);
    if (cache.size > 200000) cache.clear();
    cache.set(word, f);
    return f;
  }

  function letterIn(f, L) { return (f.mask & (1 << (L.charCodeAt(0) - 65))) !== 0; }
  function shared(a, b) { return popcount(a.mask & b.mask); }

  LK.names = {
    FIRST: FIRST, LAST: LAST, ALL_LAST: ALL_LAST, randomLast: randomLast, VOWELS: VOWELS, pool: pool, isFamous: isFamous,
    facts: facts, letterIn: letterIn, shared: shared, popcount: popcount, upper: upper
  };
})(typeof window !== 'undefined' ? window : globalThis);
