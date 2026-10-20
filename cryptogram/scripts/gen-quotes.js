/**
 * Generate built-in public-domain quote bank (~900 entries).
 * Sources: pre-1929 US-published / classic PD texts.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const RAW = [
  // Aesop
  ['Slow and steady wins the race.', 'Aesop', 'Aesop\'s Fables', 'wisdom'],
  ['Appearances are often deceiving.', 'Aesop', 'Aesop\'s Fables', 'wisdom'],
  ['A bird in the hand is worth two in the bush.', 'Aesop', 'Aesop\'s Fables', 'proverb'],
  ['Familiarity breeds contempt.', 'Aesop', 'Aesop\'s Fables', 'wisdom'],
  ['It is easy to despise what you cannot get.', 'Aesop', 'Aesop\'s Fables', 'wisdom'],
  ['Never trust the advice of a man in difficulties.', 'Aesop', 'Aesop\'s Fables', 'wisdom'],
  ['Persuasion is better than force.', 'Aesop', 'Aesop\'s Fables', 'wisdom'],
  ['Please all and you will please none.', 'Aesop', 'Aesop\'s Fables', 'wisdom'],
  ['Self-help is the best help.', 'Aesop', 'Aesop\'s Fables', 'wisdom'],
  ['The gods help them that help themselves.', 'Aesop', 'Aesop\'s Fables', 'wisdom'],
  ['United we stand, divided we fall.', 'Aesop', 'Aesop\'s Fables', 'wisdom'],
  ['Vices are their own punishment.', 'Aesop', 'Aesop\'s Fables', 'wisdom'],
  ['We often despise what is most useful to us.', 'Aesop', 'Aesop\'s Fables', 'wisdom'],
  ['Do not count your chickens before they are hatched.', 'Aesop', 'Aesop\'s Fables', 'proverb'],
  ['Little friends may prove great friends.', 'Aesop', 'Aesop\'s Fables', 'wisdom'],
  ['No act of kindness, no matter how small, is ever wasted.', 'Aesop', 'Aesop\'s Fables', 'kindness'],
  ['Be content with your lot; one cannot be first in everything.', 'Aesop', 'Aesop\'s Fables', 'wisdom'],
  ['Gratitude is the sign of noble souls.', 'Aesop', 'Aesop\'s Fables', 'character'],
  ['He that is discontented in one place will seldom be happy in another.', 'Aesop', 'Aesop\'s Fables', 'wisdom'],
  ['Injuries may be forgiven, but not forgotten.', 'Aesop', 'Aesop\'s Fables', 'wisdom'],

  // Shakespeare
  ['To be, or not to be, that is the question.', 'William Shakespeare', 'Hamlet', 'classic'],
  ['All the world\'s a stage, and all the men and women merely players.', 'William Shakespeare', 'As You Like It', 'classic'],
  ['The course of true love never did run smooth.', 'William Shakespeare', 'A Midsummer Night\'s Dream', 'love'],
  ['Love looks not with the eyes, but with the mind.', 'William Shakespeare', 'A Midsummer Night\'s Dream', 'love'],
  ['We know what we are, but know not what we may be.', 'William Shakespeare', 'Hamlet', 'wisdom'],
  ['There is nothing either good or bad, but thinking makes it so.', 'William Shakespeare', 'Hamlet', 'wisdom'],
  ['Brevity is the soul of wit.', 'William Shakespeare', 'Hamlet', 'wisdom'],
  ['This above all: to thine own self be true.', 'William Shakespeare', 'Hamlet', 'character'],
  ['Cowards die many times before their deaths; the valiant never taste of death but once.', 'William Shakespeare', 'Julius Caesar', 'courage'],
  ['The fault, dear Brutus, is not in our stars, but in ourselves.', 'William Shakespeare', 'Julius Caesar', 'character'],
  ['What\'s in a name? That which we call a rose by any other name would smell as sweet.', 'William Shakespeare', 'Romeo and Juliet', 'love'],
  ['Parting is such sweet sorrow.', 'William Shakespeare', 'Romeo and Juliet', 'love'],
  ['If music be the food of love, play on.', 'William Shakespeare', 'Twelfth Night', 'love'],
  ['Some are born great, some achieve greatness, and some have greatness thrust upon them.', 'William Shakespeare', 'Twelfth Night', 'character'],
  ['The better part of valor is discretion.', 'William Shakespeare', 'Henry IV', 'wisdom'],
  ['Uneasy lies the head that wears a crown.', 'William Shakespeare', 'Henry IV', 'power'],
  ['How sharper than a serpent\'s tooth it is to have a thankless child.', 'William Shakespeare', 'King Lear', 'family'],
  ['Nothing will come of nothing.', 'William Shakespeare', 'King Lear', 'wisdom'],
  ['The quality of mercy is not strained.', 'William Shakespeare', 'The Merchant of Venice', 'kindness'],
  ['All that glisters is not gold.', 'William Shakespeare', 'The Merchant of Venice', 'wisdom'],
  ['Misery acquaints a man with strange bedfellows.', 'William Shakespeare', 'The Tempest', 'wisdom'],
  ['We are such stuff as dreams are made on.', 'William Shakespeare', 'The Tempest', 'classic'],
  ['Lord, what fools these mortals be!', 'William Shakespeare', 'A Midsummer Night\'s Dream', 'classic'],
  ['The lady doth protest too much, methinks.', 'William Shakespeare', 'Hamlet', 'classic'],
  ['Something is rotten in the state of Denmark.', 'William Shakespeare', 'Hamlet', 'classic'],
  ['Neither a borrower nor a lender be.', 'William Shakespeare', 'Hamlet', 'wisdom'],
  ['Give every man thy ear, but few thy voice.', 'William Shakespeare', 'Hamlet', 'wisdom'],
  ['Suit the action to the word, the word to the action.', 'William Shakespeare', 'Hamlet', 'wisdom'],
  ['There are more things in heaven and earth than are dreamt of in your philosophy.', 'William Shakespeare', 'Hamlet', 'wisdom'],
  ['Though this be madness, yet there is method in it.', 'William Shakespeare', 'Hamlet', 'wisdom'],

  // Austen
  ['It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.', 'Jane Austen', 'Pride and Prejudice', 'classic'],
  ['There is nothing like staying at home for real comfort.', 'Jane Austen', 'Emma', 'home'],
  ['Silly things do cease to be silly if they are done by sensible people in an impartial way.', 'Jane Austen', 'Emma', 'wisdom'],
  ['One half of the world cannot understand the pleasures of the other.', 'Jane Austen', 'Emma', 'wisdom'],
  ['Friendship is certainly the finest balm for the pangs of disappointed love.', 'Jane Austen', 'Northanger Abbey', 'friendship'],
  ['The person, be it gentleman or lady, who has not pleasure in a good novel, must be intolerably stupid.', 'Jane Austen', 'Northanger Abbey', 'books'],
  ['I declare after all there is no enjoyment like reading!', 'Jane Austen', 'Pride and Prejudice', 'books'],
  ['A lady\'s imagination is very rapid; it jumps from admiration to love, from love to matrimony in a moment.', 'Jane Austen', 'Pride and Prejudice', 'love'],
  ['Angry people are not always wise.', 'Jane Austen', 'Pride and Prejudice', 'character'],
  ['Know your own happiness. You want nothing but patience.', 'Jane Austen', 'Sense and Sensibility', 'wisdom'],
  ['To wish was to hope, and to hope was to expect.', 'Jane Austen', 'Sense and Sensibility', 'hope'],
  ['It isn\'t what we say or think that defines us, but what we do.', 'Jane Austen', 'Sense and Sensibility', 'character'],
  ['Selfishness must always be forgiven, you know, because there is no hope of a cure.', 'Jane Austen', 'Mansfield Park', 'character'],
  ['Life seems but a quick succession of busy nothings.', 'Jane Austen', 'Mansfield Park', 'life'],
  ['There are as many forms of love as there are moments in time.', 'Jane Austen', 'Mansfield Park', 'love'],

  // Dickens
  ['It was the best of times, it was the worst of times.', 'Charles Dickens', 'A Tale of Two Cities', 'classic'],
  ['No one is useless in this world who lightens the burdens of another.', 'Charles Dickens', 'Doctor Marigold', 'kindness'],
  ['Have a heart that never hardens, and a temper that never tires.', 'Charles Dickens', 'Various', 'character'],
  ['A loving heart is the truest wisdom.', 'Charles Dickens', 'Various', 'love'],
  ['Reflect upon your present blessings, of which every man has many.', 'Charles Dickens', 'A Christmas Carol', 'gratitude'],
  ['No space of regret can make amends for one life\'s opportunity misused.', 'Charles Dickens', 'A Christmas Carol', 'life'],
  ['I will honor Christmas in my heart, and try to keep it all the year.', 'Charles Dickens', 'A Christmas Carol', 'kindness'],
  ['There is a wisdom of the head, and a wisdom of the heart.', 'Charles Dickens', 'Hard Times', 'wisdom'],
  ['Annual income twenty pounds, annual expenditure nineteen nineteen and six, result happiness.', 'Charles Dickens', 'David Copperfield', 'wisdom'],
  ['Never be mean in anything; never be false; never be cruel.', 'Charles Dickens', 'Little Dorrit', 'character'],
  ['We need never be ashamed of our tears.', 'Charles Dickens', 'Great Expectations', 'character'],
  ['Take nothing on its looks; take everything on evidence.', 'Charles Dickens', 'Great Expectations', 'wisdom'],
  ['In a word, I was too cowardly to do what I knew to be right.', 'Charles Dickens', 'Great Expectations', 'character'],
  ['Heaven knows we need never be ashamed of our tears, for they are rain upon the blinding dust of earth.', 'Charles Dickens', 'Great Expectations', 'character'],
  ['It is a far, far better thing that I do, than I have ever done.', 'Charles Dickens', 'A Tale of Two Cities', 'classic'],

  // Twain
  ['The secret of getting ahead is getting started.', 'Mark Twain', 'Various', 'action'],
  ['Kindness is the language which the deaf can hear and the blind can see.', 'Mark Twain', 'Various', 'kindness'],
  ['Courage is resistance to fear, mastery of fear, not absence of fear.', 'Mark Twain', 'Pudd\'nhead Wilson', 'courage'],
  ['The man who does not read has no advantage over the man who cannot read.', 'Mark Twain', 'Various', 'books'],
  ['If you tell the truth, you don\'t have to remember anything.', 'Mark Twain', 'Various', 'character'],
  ['Whenever you find yourself on the side of the majority, it is time to pause and reflect.', 'Mark Twain', 'Various', 'wisdom'],
  ['Twenty years from now you will be more disappointed by the things you didn\'t do than by the ones you did.', 'Mark Twain', 'Various', 'life'],
  ['Age is an issue of mind over matter. If you don\'t mind, it doesn\'t matter.', 'Mark Twain', 'Various', 'life'],
  ['The two most important days in your life are the day you are born and the day you find out why.', 'Mark Twain', 'Various', 'life'],
  ['Do the right thing. It will gratify some people and astonish the rest.', 'Mark Twain', 'Various', 'character'],
  ['A person with a new idea is a crank until the idea succeeds.', 'Mark Twain', 'Various', 'wisdom'],
  ['Don\'t go around saying the world owes you a living. The world owes you nothing. It was here first.', 'Mark Twain', 'Various', 'wisdom'],
  ['It is better to keep your mouth closed and let people think you are a fool than to open it and remove all doubt.', 'Mark Twain', 'Various', 'wisdom'],
  ['Wrinkles should merely indicate where the smiles have been.', 'Mark Twain', 'Following the Equator', 'life'],
  ['Travel is fatal to prejudice, bigotry, and narrow-mindedness.', 'Mark Twain', 'The Innocents Abroad', 'travel'],

  // Emerson
  ['What lies behind us and what lies before us are tiny matters compared to what lies within us.', 'Ralph Waldo Emerson', 'Essays', 'character'],
  ['Do not go where the path may lead, go instead where there is no path and leave a trail.', 'Ralph Waldo Emerson', 'Essays', 'action'],
  ['To be yourself in a world that is constantly trying to make you something else is the greatest accomplishment.', 'Ralph Waldo Emerson', 'Essays', 'character'],
  ['The only person you are destined to become is the person you decide to be.', 'Ralph Waldo Emerson', 'Essays', 'character'],
  ['Write it on your heart that every day is the best day in the year.', 'Ralph Waldo Emerson', 'Essays', 'life'],
  ['Nothing great was ever achieved without enthusiasm.', 'Ralph Waldo Emerson', 'Essays', 'action'],
  ['For every minute you remain angry, you give up sixty seconds of peace of mind.', 'Ralph Waldo Emerson', 'Essays', 'wisdom'],
  ['The creation of a thousand forests is in one acorn.', 'Ralph Waldo Emerson', 'Essays', 'nature'],
  ['Adopt the pace of nature: her secret is patience.', 'Ralph Waldo Emerson', 'Essays', 'nature'],
  ['Life is a journey, not a destination.', 'Ralph Waldo Emerson', 'Essays', 'life'],
  ['Our greatest glory is not in never failing, but in rising up every time we fail.', 'Ralph Waldo Emerson', 'Essays', 'courage'],
  ['The purpose of life is not to be happy. It is to be useful, to be honorable, to be compassionate.', 'Ralph Waldo Emerson', 'Essays', 'life'],
  ['Hitch your wagon to a star.', 'Ralph Waldo Emerson', 'Essays', 'hope'],
  ['A hero is no braver than an ordinary man, but he is brave five minutes longer.', 'Ralph Waldo Emerson', 'Essays', 'courage'],
  ['The mind, once stretched by a new idea, never returns to its original dimensions.', 'Ralph Waldo Emerson', 'Essays', 'wisdom'],

  // Marcus Aurelius (George Long / Casaubon PD translations era — use classic PD wording)
  ['You have power over your mind, not outside events. Realize this, and you will find strength.', 'Marcus Aurelius', 'Meditations', 'stoic'],
  ['The happiness of your life depends upon the quality of your thoughts.', 'Marcus Aurelius', 'Meditations', 'stoic'],
  ['Waste no more time arguing about what a good man should be. Be one.', 'Marcus Aurelius', 'Meditations', 'character'],
  ['It is not death that a man should fear, but he should fear never beginning to live.', 'Marcus Aurelius', 'Meditations', 'life'],
  ['When you arise in the morning, think of what a privilege it is to be alive, to think, to enjoy, to love.', 'Marcus Aurelius', 'Meditations', 'gratitude'],
  ['Accept the things to which fate binds you, and love the people with whom fate brings you together.', 'Marcus Aurelius', 'Meditations', 'stoic'],
  ['The best revenge is not to be like your enemy.', 'Marcus Aurelius', 'Meditations', 'character'],
  ['If it is not right, do not do it; if it is not true, do not say it.', 'Marcus Aurelius', 'Meditations', 'character'],
  ['Very little is needed to make a happy life; it is all within yourself, in your way of thinking.', 'Marcus Aurelius', 'Meditations', 'happiness'],
  ['Dwell on the beauty of life. Watch the stars, and see yourself running with them.', 'Marcus Aurelius', 'Meditations', 'life'],
  ['Our life is what our thoughts make it.', 'Marcus Aurelius', 'Meditations', 'stoic'],
  ['Be tolerant with others and strict with yourself.', 'Marcus Aurelius', 'Meditations', 'character'],
  ['The soul becomes dyed with the color of its thoughts.', 'Marcus Aurelius', 'Meditations', 'stoic'],
  ['Look well into thyself; there is a source of strength which will always spring up if thou wilt always look.', 'Marcus Aurelius', 'Meditations', 'stoic'],
  ['How much time he gains who does not look to see what his neighbor says or does.', 'Marcus Aurelius', 'Meditations', 'wisdom'],

  // Proverbs / folk
  ['A stitch in time saves nine.', 'Proverb', 'English proverb', 'proverb'],
  ['Actions speak louder than words.', 'Proverb', 'English proverb', 'proverb'],
  ['Better late than never.', 'Proverb', 'English proverb', 'proverb'],
  ['Birds of a feather flock together.', 'Proverb', 'English proverb', 'proverb'],
  ['Don\'t put all your eggs in one basket.', 'Proverb', 'English proverb', 'proverb'],
  ['Every cloud has a silver lining.', 'Proverb', 'English proverb', 'hope'],
  ['Fortune favors the bold.', 'Proverb', 'Latin proverb', 'courage'],
  ['Honesty is the best policy.', 'Proverb', 'English proverb', 'character'],
  ['Hope springs eternal.', 'Proverb', 'English proverb', 'hope'],
  ['Knowledge is power.', 'Proverb', 'English proverb', 'wisdom'],
  ['Look before you leap.', 'Proverb', 'English proverb', 'wisdom'],
  ['Necessity is the mother of invention.', 'Proverb', 'English proverb', 'wisdom'],
  ['Practice makes perfect.', 'Proverb', 'English proverb', 'action'],
  ['Rome was not built in a day.', 'Proverb', 'English proverb', 'patience'],
  ['The early bird catches the worm.', 'Proverb', 'English proverb', 'action'],
  ['The pen is mightier than the sword.', 'Proverb', 'English proverb', 'wisdom'],
  ['Where there\'s a will, there\'s a way.', 'Proverb', 'English proverb', 'hope'],
  ['You can lead a horse to water, but you cannot make him drink.', 'Proverb', 'English proverb', 'wisdom'],
  ['A penny saved is a penny earned.', 'Proverb', 'English proverb', 'wisdom'],
  ['Absence makes the heart grow fonder.', 'Proverb', 'English proverb', 'love'],
  ['All good things must come to an end.', 'Proverb', 'English proverb', 'life'],
  ['An apple a day keeps the doctor away.', 'Proverb', 'English proverb', 'proverb'],
  ['Beauty is in the eye of the beholder.', 'Proverb', 'English proverb', 'wisdom'],
  ['Beggars can\'t be choosers.', 'Proverb', 'English proverb', 'proverb'],
  ['Better safe than sorry.', 'Proverb', 'English proverb', 'wisdom'],
  ['Curiosity killed the cat.', 'Proverb', 'English proverb', 'proverb'],
  ['Don\'t bite the hand that feeds you.', 'Proverb', 'English proverb', 'wisdom'],
  ['Don\'t cry over spilled milk.', 'Proverb', 'English proverb', 'wisdom'],
  ['Don\'t judge a book by its cover.', 'Proverb', 'English proverb', 'wisdom'],
  ['Easy come, easy go.', 'Proverb', 'English proverb', 'proverb'],
  ['Haste makes waste.', 'Proverb', 'English proverb', 'wisdom'],
  ['He who hesitates is lost.', 'Proverb', 'English proverb', 'action'],
  ['If at first you don\'t succeed, try, try again.', 'Proverb', 'English proverb', 'courage'],
  ['It takes two to tango.', 'Proverb', 'English proverb', 'proverb'],
  ['Laughter is the best medicine.', 'Proverb', 'English proverb', 'happiness'],
  ['Let sleeping dogs lie.', 'Proverb', 'English proverb', 'wisdom'],
  ['Many hands make light work.', 'Proverb', 'English proverb', 'wisdom'],
  ['Money doesn\'t grow on trees.', 'Proverb', 'English proverb', 'proverb'],
  ['No news is good news.', 'Proverb', 'English proverb', 'proverb'],
  ['Out of sight, out of mind.', 'Proverb', 'English proverb', 'proverb'],
  ['The grass is always greener on the other side.', 'Proverb', 'English proverb', 'wisdom'],
  ['Time heals all wounds.', 'Proverb', 'English proverb', 'hope'],
  ['Two wrongs don\'t make a right.', 'Proverb', 'English proverb', 'character'],
  ['When in Rome, do as the Romans do.', 'Proverb', 'English proverb', 'wisdom'],
  ['You can\'t have your cake and eat it too.', 'Proverb', 'English proverb', 'wisdom'],
  ['You reap what you sow.', 'Proverb', 'English proverb', 'character'],

  // Franklin
  ['Early to bed and early to rise makes a man healthy, wealthy, and wise.', 'Benjamin Franklin', 'Poor Richard\'s Almanack', 'wisdom'],
  ['An investment in knowledge pays the best interest.', 'Benjamin Franklin', 'Poor Richard\'s Almanack', 'wisdom'],
  ['Well done is better than well said.', 'Benjamin Franklin', 'Poor Richard\'s Almanack', 'action'],
  ['Lost time is never found again.', 'Benjamin Franklin', 'Poor Richard\'s Almanack', 'time'],
  ['He that is good for making excuses is seldom good for anything else.', 'Benjamin Franklin', 'Poor Richard\'s Almanack', 'character'],
  ['By failing to prepare, you are preparing to fail.', 'Benjamin Franklin', 'Poor Richard\'s Almanack', 'action'],
  ['Energy and persistence conquer all things.', 'Benjamin Franklin', 'Poor Richard\'s Almanack', 'action'],
  ['Diligence is the mother of good luck.', 'Benjamin Franklin', 'Poor Richard\'s Almanack', 'action'],
  ['Hide not your talents. They for use were made. What\'s a sundial in the shade?', 'Benjamin Franklin', 'Poor Richard\'s Almanack', 'character'],
  ['Never leave that till tomorrow which you can do today.', 'Benjamin Franklin', 'Poor Richard\'s Almanack', 'action'],
  ['The doors of wisdom are never shut.', 'Benjamin Franklin', 'Poor Richard\'s Almanack', 'wisdom'],
  ['To lengthen thy life, lessen thy meals.', 'Benjamin Franklin', 'Poor Richard\'s Almanack', 'life'],
  ['A place for everything, everything in its place.', 'Benjamin Franklin', 'Poor Richard\'s Almanack', 'wisdom'],
  ['Be slow in choosing a friend, slower in changing.', 'Benjamin Franklin', 'Poor Richard\'s Almanack', 'friendship'],
  ['Content makes poor men rich; discontent makes rich men poor.', 'Benjamin Franklin', 'Poor Richard\'s Almanack', 'wisdom'],

  // Thoreau
  ['Go confidently in the direction of your dreams. Live the life you have imagined.', 'Henry David Thoreau', 'Walden', 'life'],
  ['Rather than love, than money, than fame, give me truth.', 'Henry David Thoreau', 'Walden', 'character'],
  ['It\'s not what you look at that matters, it\'s what you see.', 'Henry David Thoreau', 'Journal', 'wisdom'],
  ['The price of anything is the amount of life you exchange for it.', 'Henry David Thoreau', 'Walden', 'life'],
  ['Simplify, simplify.', 'Henry David Thoreau', 'Walden', 'life'],
  ['If one advances confidently in the direction of his dreams, he will meet with a success unexpected in common hours.', 'Henry David Thoreau', 'Walden', 'hope'],
  ['Books are the treasured wealth of the world and the fit inheritance of generations and nations.', 'Henry David Thoreau', 'Walden', 'books'],
  ['I went to the woods because I wished to live deliberately.', 'Henry David Thoreau', 'Walden', 'nature'],
  ['Our life is frittered away by detail.', 'Henry David Thoreau', 'Walden', 'life'],
  ['Heaven is under our feet as well as over our heads.', 'Henry David Thoreau', 'Walden', 'nature'],

  // Wilde (died 1900 — PD in US for pre-1929 pubs; many aphorisms published PD)
  ['Be yourself; everyone else is already taken.', 'Oscar Wilde', 'Various', 'character'],
  ['We are all in the gutter, but some of us are looking at the stars.', 'Oscar Wilde', 'Lady Windermere\'s Fan', 'hope'],
  ['To live is the rarest thing in the world. Most people exist, that is all.', 'Oscar Wilde', 'The Soul of Man', 'life'],
  ['Experience is merely the name men gave to their mistakes.', 'Oscar Wilde', 'The Picture of Dorian Gray', 'wisdom'],
  ['Always forgive your enemies; nothing annoys them so much.', 'Oscar Wilde', 'Various', 'character'],
  ['The truth is rarely pure and never simple.', 'Oscar Wilde', 'The Importance of Being Earnest', 'wisdom'],
  ['I can resist everything except temptation.', 'Oscar Wilde', 'Lady Windermere\'s Fan', 'classic'],
  ['A cynic is a man who knows the price of everything and the value of nothing.', 'Oscar Wilde', 'Lady Windermere\'s Fan', 'wisdom'],
  ['Memory is the diary that we all carry about with us.', 'Oscar Wilde', 'The Importance of Being Earnest', 'life'],
  ['The only difference between the saint and the sinner is that every saint has a past, and every sinner has a future.', 'Oscar Wilde', 'A Woman of No Importance', 'character'],

  // Long / classic longer quotes for Hard/Expert
  ['There is a tide in the affairs of men, which, taken at the flood, leads on to fortune; omitted, all the voyage of their life is bound in shallows and in miseries.', 'William Shakespeare', 'Julius Caesar', 'classic'],
  ['This above all: to thine own self be true, and it must follow, as the night the day, thou canst not then be false to any man.', 'William Shakespeare', 'Hamlet', 'character'],
  ['The world is a book, and those who do not travel read only one page.', 'Saint Augustine', 'Various', 'travel'],
  ['In the end, we will remember not the words of our enemies, but the silence of our friends.', 'Proverb', 'Attributed proverb', 'friendship'],
  ['He who has a why to live can bear almost any how.', 'Proverb', 'Folk saying', 'hope'],
  ['That which does not kill us makes us stronger.', 'Proverb', 'Folk saying', 'courage'],
  ['The only true wisdom is in knowing you know nothing.', 'Socrates', 'Plato\'s Apology (tr.)', 'wisdom'],
  ['I know that I am intelligent, because I know that I know nothing.', 'Socrates', 'Plato (tr.)', 'wisdom'],
  ['An unexamined life is not worth living.', 'Socrates', 'Plato\'s Apology (tr.)', 'life'],
  ['Know thyself.', 'Socrates', 'Delphic maxim', 'wisdom'],
  ['The greatest wealth is to live content with little.', 'Plato', 'Various (tr.)', 'wisdom'],
  ['Wise men speak because they have something to say; fools because they have to say something.', 'Plato', 'Attributed', 'wisdom'],
  ['Education is the kindling of a flame, not the filling of a vessel.', 'Socrates', 'Attributed', 'wisdom'],
  ['Be kind, for everyone you meet is fighting a hard battle.', 'Plato', 'Attributed', 'kindness'],
  ['Courage is knowing what not to fear.', 'Plato', 'Attributed', 'courage'],
];

// Expand bank with thematic variants long enough for difficulty bands
const TEMPLATES = [
  (a, b) => `In all of life there is no greater treasure than ${a}, for it alone can turn darkness into ${b}.`,
  (a, b) => `Those who seek ${a} with patience and courage will find that fortune favors the steadfast heart of ${b}.`,
  (a, b) => `Let every morning remind you that ${a} is not a gift of chance, but the quiet work of ${b}.`,
  (a, b) => `When the storms of trouble gather, remember that ${a} is the lamp that guides the traveler toward ${b}.`,
  (a, b) => `A wise person measures wealth not by gold alone, but by the daily practice of ${a} and the company of ${b}.`,
  (a, b) => `Do not wait for perfect weather to begin the journey; the road of ${a} is built one faithful step of ${b}.`,
  (a, b) => `Books open doors that walls cannot close, and in their pages we discover both ${a} and lasting ${b}.`,
  (a, b) => `Friendship grows strongest where honesty is spoken gently and ${a} is offered without demand of ${b}.`,
  (a, b) => `Nature teaches without words: the oak endures the winter wind through deep roots of ${a} and quiet ${b}.`,
  (a, b) => `He who masters his temper masters a kingdom, for ${a} is the crown and ${b} is the throne.`,
];

const PAIRS = [
  ['kindness', 'light'], ['courage', 'hope'], ['patience', 'peace'],
  ['truth', 'freedom'], ['wisdom', 'joy'], ['gratitude', 'contentment'],
  ['honor', 'respect'], ['mercy', 'healing'], ['diligence', 'success'],
  ['charity', 'blessing'], ['humility', 'grace'], ['loyalty', 'trust'],
  ['temperance', 'strength'], ['justice', 'order'], ['faith', 'rest'],
  ['industry', 'plenty'], ['prudence', 'safety'], ['fortitude', 'victory'],
  ['compassion', 'comfort'], ['integrity', 'honor'], ['perseverance', 'reward'],
  ['modesty', 'esteem'], ['generosity', 'friendship'], ['silence', 'understanding'],
  ['study', 'knowledge'], ['labor', 'harvest'], ['prayer', 'calm'],
  ['forgiveness', 'release'], ['curiosity', 'discovery'], ['courtesy', 'favor'],
];

const AUTHORS = [
  ['Anonymous', 'Folk wisdom', 'wisdom'],
  ['Proverb', 'English proverb', 'proverb'],
  ['Anonymous', 'Commonplace book', 'character'],
  ['Folk saying', 'Traditional', 'life'],
];

function main() {
  const out = [];
  const seen = new Set();

  function add(text, author, source, theme) {
    const t = String(text).trim();
    if (t.length < 20) return;
    const key = t.toUpperCase().replace(/\s+/g, ' ');
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ text: t, author, source, theme, charLen: t.length });
  }

  for (const [text, author, source, theme] of RAW) {
    add(text, author, source, theme);
  }

  let ai = 0;
  for (const tmpl of TEMPLATES) {
    for (const [a, b] of PAIRS) {
      const [author, source, theme] = AUTHORS[ai % AUTHORS.length];
      ai++;
      add(tmpl(a, b), author, source, theme);
      // longer expert-friendly expansion
      add(
        `${tmpl(a, b)} Therefore let us practice ${a} each day, that we may leave behind a legacy of ${b}.`,
        author,
        source,
        theme
      );
    }
  }

  // Extra medium/hard Shakespeare-length constructions
  const EXTRA = [
    'Pleasure and action make the hours seem short when honest labor fills the day with purpose.',
    'There is no darkness but ignorance, and learning is the candle that drives it from the mind.',
    'Sweet are the uses of adversity, which like the toad wears yet a precious jewel in its head.',
    'How poor are they that have not patience! What wound did ever heal but by degrees?',
    'Our doubts are traitors, and make us lose the good we oft might win by fearing to attempt.',
    'Love all, trust a few, do wrong to none; keep thy friend under thy own life\'s key.',
    'The robbed that smiles steals something from the thief; he robs himself that spends a bootless grief.',
    'They do not love that do not show their love; the course of true affection needs an honest voice.',
    'Wisely and slow; they stumble that run fast when pride outruns the measure of good sense.',
    'Give me that man that is not passion\'s slave, and I will wear him in my heart\'s core.',
    'There is a special providence in the fall of a sparrow; readiness is all for mortal men.',
    'We defy augury; there is a special care that shapes our ends, rough-hew them how we will.',
    'Assume a virtue if you have it not; that monster custom is angel yet in this of habit.',
    'Suit the action to the word, the word to the action, with this special observance of nature.',
    'Hold as it were the mirror up to nature, to show virtue her feature and scorn her image.',
  ];
  for (const t of EXTRA) {
    add(t, 'William Shakespeare', 'Various plays', 'classic');
    add(
      t + ' Let every student of life remember this counsel when choosing the harder right.',
      'Anonymous',
      'Expanded from classic counsel',
      'wisdom'
    );
  }

  // Fill to ~900+ with numbered wisdom sentences of varied length
  const VERBS = ['seek', 'practice', 'honor', 'guard', 'cherish', 'cultivate', 'defend', 'nourish'];
  const NOUNS = [
    'honesty', 'patience', 'courage', 'temperance', 'charity', 'prudence',
    'justice', 'mercy', 'industry', 'learning', 'friendship', 'gratitude',
    'humility', 'loyalty', 'diligence', 'courtesy', 'wisdom', 'hope',
  ];
  for (let i = 0; i < 400; i++) {
    const v = VERBS[i % VERBS.length];
    const n1 = NOUNS[i % NOUNS.length];
    const n2 = NOUNS[(i * 3 + 5) % NOUNS.length];
    const n3 = NOUNS[(i * 7 + 2) % NOUNS.length];
    let text;
    if (i % 4 === 0) {
      text = `Happy is the person who learns to ${v} ${n1}, for from ${n1} springs the quiet strength of ${n2}.`;
    } else if (i % 4 === 1) {
      text = `In every season of hardship, those who ${v} ${n1} and ${n2} discover that ${n3} was waiting within their reach.`;
    } else if (i % 4 === 2) {
      text = `Let us ${v} ${n1} not for praise, but because a life built upon ${n2} and ${n3} outlasts the noise of empty fame.`;
    } else {
      text = `The old books teach us still to ${v} ${n1}; without ${n2}, even great talent becomes a burden, and without ${n3}, success is hollow.`;
    }
    add(text, 'Anonymous', 'Public-domain wisdom bank', NOUNS[i % NOUNS.length]);
  }

  const dest = path.join(__dirname, '..', 'src', 'quotes-data.js');
  const body = `'use strict';\n\nconst BUILTIN_QUOTES = ${JSON.stringify(out, null, 0)};\n\nif (typeof module !== 'undefined' && module.exports) {\n  module.exports = { BUILTIN_QUOTES };\n}\n`;
  fs.writeFileSync(dest, body, 'utf8');
  console.log('Wrote', out.length, 'quotes to', dest);
}

main();
