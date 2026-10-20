/*
 * The starter library: 22 hand-written packs (44 mysteries) so a book with only a few packs of
 * your own still fills every level. Words were chosen to read the same in
 * American and British English. Anything a reader could argue about sits in "maybe", which
 * the engine never relies on. Your own packs come from the AI prompt in step 2.
 *
 * Compact form: options are one comma list; a fact is [clue, not-clue, yes list, maybe list].
 */
(function (root) {
  'use strict';
  var CX = root.CX = root.CX || {};

  var RAW = [
    {
      topic: 'Fruit at the market',
      cases: [['The Market Mix-Up', 'The fruit seller’s sign blew off one crate, and now nobody knows what is in it. Which fruit is it?'],
        ['The Smoothie Secret', 'Aunt May’s prize-winning smoothie has one secret fruit, and she will not tell. Which fruit is it?']],
      options: 'Apple, Banana, Cherry, Grape, Lemon, Lime, Mango, Orange, Peach, Pear, Plum, Kiwi, Melon, Watermelon, Pineapple, Strawberry, Raspberry, Blueberry, Blackberry, Coconut, Apricot, Fig, Date, Papaya, Grapefruit, Nectarine, Pomegranate, Cranberry, Tangerine, Gooseberry, Passion Fruit, Avocado',
      facts: [
        ['It is a citrus fruit', 'It is not a citrus fruit', 'Lemon, Lime, Orange, Grapefruit, Tangerine', ''],
        ['It has a stone in the middle', 'It does not have a stone in the middle', 'Peach, Plum, Cherry, Apricot, Mango, Nectarine, Date, Avocado', 'Coconut'],
        ['It is small enough to eat in one bite', 'It is too big to eat in one bite', 'Grape, Blueberry, Raspberry, Blackberry, Cranberry, Gooseberry', 'Cherry, Strawberry, Date, Fig, Kiwi, Plum, Apricot'],
        ['It is green on the outside', 'It is not green on the outside', 'Lime, Watermelon, Avocado', 'Gooseberry, Grape, Apple, Pear, Melon, Fig, Papaya, Mango, Kiwi, Passion Fruit'],
        ['It is usually red', 'It is not usually red', 'Cherry, Strawberry, Raspberry, Cranberry, Pomegranate', 'Apple, Plum, Grape, Watermelon, Nectarine, Peach, Gooseberry, Date, Fig, Grapefruit, Papaya, Mango, Passion Fruit'],
        ['It is usually peeled before eating', 'It is not usually peeled before eating', 'Banana, Orange, Tangerine, Pineapple, Grapefruit', 'Mango, Kiwi, Coconut, Melon, Watermelon, Papaya, Avocado, Pomegranate, Passion Fruit, Lemon, Lime, Apple, Pear, Peach']
      ]
    },
    {
      topic: 'The baking cupboard',
      cases: [['The Flat Cake', 'The birthday cake came out of the oven as flat as a pancake. Which ingredient did the baker forget?'],
        ['The Empty Jar', 'Someone has been raiding the baking cupboard at midnight, and one jar is now empty. Which one?']],
      options: 'Flour, Sugar, Butter, Egg, Milk, Salt, Honey, Cocoa, Vanilla, Cinnamon, Nutmeg, Ginger, Raisin, Almond, Walnut, Pecan, Hazelnut, Coconut, Baking Powder, Yeast, Syrup, Cream, Margarine, Lard, Oats, Lemon, Banana, Carrot, Chocolate Chip, Marzipan, Jam, Cream Cheese, Brown Sugar, Peanut Butter',
      facts: [
        ['It is a nut', 'It is not a nut', 'Almond, Walnut, Pecan, Hazelnut', 'Coconut, Peanut Butter, Marzipan'],
        ['It is a spice', 'It is not a spice', 'Cinnamon, Nutmeg, Ginger', 'Vanilla, Salt'],
        ['It is made from milk', 'It is not made from milk', 'Butter, Cream, Cream Cheese', 'Margarine, Milk, Chocolate Chip, Cocoa'],
        ['It is a fruit', 'It is not a fruit', 'Raisin, Lemon, Banana', 'Coconut, Jam, Vanilla, Almond, Walnut, Pecan, Hazelnut'],
        ['It is a fine powder', 'It is not a fine powder', 'Flour, Cocoa, Baking Powder', 'Cinnamon, Nutmeg, Ginger, Salt, Sugar, Brown Sugar, Yeast'],
        ['It tastes sweet', 'It does not taste sweet', 'Sugar, Honey, Syrup, Jam, Marzipan, Chocolate Chip, Brown Sugar, Raisin', 'Banana, Coconut, Cocoa, Vanilla, Cream, Milk, Carrot, Peanut Butter, Cinnamon, Butter, Margarine, Cream Cheese, Oats, Almond, Hazelnut, Pecan, Walnut, Nutmeg, Ginger']
      ]
    },
    {
      topic: 'Places in town',
      cases: [['The Lost Umbrella', 'Mr. Patel ran a dozen errands today and came home without his umbrella. Where did he leave it?'],
        ['The Secret Meeting', 'Two old friends planned to meet in town, but one of them went to the wrong place. Where did she end up?']],
      options: 'Library, Museum, Bakery, Bank, Post Office, Police Station, Fire Station, Hospital, School, Church, Cinema, Park, Playground, Zoo, Aquarium, Swimming Pool, Supermarket, Pharmacy, Hotel, Restaurant, Cafe, Bus Stop, Train Station, Airport, Lighthouse, Beach, Farm, Florist, Gym, Dentist, Town Hall, Bowling Alley, Ice Rink, Stadium, Car Wash',
      facts: [
        ['It is a place where people sleep overnight', 'It is not a place where people sleep overnight', 'Hotel, Hospital', 'Fire Station, Lighthouse, Farm, Police Station, Airport, Train Station'],
        ['It is a place where animals live', 'It is not a place where animals live', 'Zoo, Aquarium, Farm', 'Park, Beach, Lighthouse'],
        ['It is right beside the water', 'It is not right beside the water', 'Lighthouse, Beach, Swimming Pool', 'Aquarium, Car Wash, Ice Rink, Park, Farm, Airport'],
        ['It is where you catch a bus, train or plane', 'It is not where you catch a bus, train or plane', 'Bus Stop, Train Station, Airport', ''],
        ['It is where you go when you are hurt or ill', 'It is not where you go when you are hurt or ill', 'Hospital, Pharmacy, Dentist', 'School'],
        ['It is a place to play sport', 'It is not a place to play sport', 'Swimming Pool, Stadium, Gym, Ice Rink, Bowling Alley', 'Park, Playground, School, Beach'],
        ['It is mainly for buying food', 'It is not mainly for buying food', 'Bakery, Supermarket, Restaurant, Cafe', 'Farm, Pharmacy, Cinema, Florist, Hotel']
      ]
    },
    {
      topic: 'Animals at the zoo',
      cases: [['The Open Gate', 'The keeper arrived at dawn to find one enclosure empty and its gate wide open. Which animal got out?'],
        ['The Unlabeled Sketch', 'A young artist drew one zoo animal for her art class but forgot to write its name. Which animal did she draw?']],
      options: 'Lion, Tiger, Elephant, Giraffe, Zebra, Monkey, Gorilla, Chimpanzee, Hippo, Rhino, Kangaroo, Koala, Panda, Polar Bear, Penguin, Flamingo, Parrot, Ostrich, Crocodile, Snake, Tortoise, Camel, Leopard, Cheetah, Wolf, Seal, Otter, Meerkat, Lemur, Peacock, Owl, Bat, Llama',
      facts: [
        ['It is a bird', 'It is not a bird', 'Penguin, Flamingo, Parrot, Ostrich, Peacock, Owl', 'Bat'],
        ['It can fly', 'It cannot fly', 'Parrot, Owl, Bat, Flamingo', 'Peacock'],
        ['It is a big cat', 'It is not a big cat', 'Lion, Tiger, Leopard, Cheetah', ''],
        ['It has stripes', 'It does not have stripes', 'Tiger, Zebra', 'Lemur, Snake, Meerkat'],
        ['It is a strong swimmer', 'It is not a strong swimmer', 'Penguin, Seal, Otter, Crocodile, Hippo, Polar Bear', 'Snake, Tortoise, Tiger, Elephant, Flamingo, Kangaroo, Rhino, Panda, Monkey'],
        ['It has a very long neck', 'It does not have a very long neck', 'Giraffe, Flamingo, Ostrich', 'Llama, Camel, Snake, Peacock'],
        ['It carries its baby in a pouch', 'It does not carry its baby in a pouch', 'Kangaroo, Koala', '']
      ]
    },
    {
      topic: 'Things in the kitchen',
      cases: [['The Drawer Thief', 'Every morning one more thing is missing from the kitchen. What disappeared today?'],
        ['The Wedding Present', 'The newlyweds unwrapped a kitchen gift that came with no card. What was inside the box?']],
      options: 'Spoon, Fork, Knife, Ladle, Whisk, Spatula, Tongs, Peeler, Grater, Colander, Sieve, Rolling Pin, Can Opener, Teapot, Kettle, Toaster, Blender, Frying Pan, Saucepan, Baking Tray, Cutting Board, Oven Mitt, Apron, Timer, Mug, Plate, Bowl, Jug, Tea Towel, Fridge, Microwave, Dishwasher, Scales',
      facts: [
        ['It plugs into the wall', 'It does not plug into the wall', 'Toaster, Blender, Fridge, Microwave, Dishwasher', 'Kettle, Timer, Scales'],
        ['It is made of cloth', 'It is not made of cloth', 'Oven Mitt, Apron, Tea Towel', ''],
        ['It has a sharp blade or edge', 'It does not have a sharp blade or edge', 'Knife, Grater, Peeler', 'Fork, Can Opener, Blender, Spatula'],
        ['It is full of holes', 'It is not full of holes', 'Colander, Sieve, Grater', 'Whisk, Spatula, Peeler, Toaster'],
        ['It is used to eat with', 'It is not used to eat with', 'Spoon, Fork, Knife', 'Plate, Bowl, Tongs, Mug'],
        ['It holds liquids', 'It does not hold liquids', 'Kettle, Teapot, Jug, Mug', 'Bowl, Saucepan, Ladle, Blender, Fridge, Dishwasher, Spoon, Frying Pan, Plate, Baking Tray, Microwave']
      ]
    },
    {
      topic: 'Clothes and accessories',
      cases: [['The Laundry Puzzle', 'Dad did all the washing, but one item never came back out of the machine. What went missing?'],
        ['The Costume Box', 'The school play starts in an hour, and one piece of the costume is nowhere to be found. Which piece?']],
      options: 'Shirt, Blouse, Cardigan, Jacket, Coat, Raincoat, Dress, Skirt, Shorts, Jeans, Overalls, T-Shirt, Hoodie, Scarf, Gloves, Mittens, Hat, Cap, Beanie, Socks, Tights, Boots, Sandals, Slippers, Belt, Tie, Bow Tie, Swimsuit, Bathrobe, Cape, Poncho, Shawl, Earmuffs, Leggings',
      facts: [
        ['It is worn on the feet', 'It is not worn on the feet', 'Socks, Boots, Sandals, Slippers', 'Tights, Leggings'],
        ['It is worn on the head', 'It is not worn on the head', 'Hat, Cap, Beanie, Earmuffs', 'Hoodie, Scarf, Poncho, Raincoat, Shawl, Cape'],
        ['It is worn on the hands', 'It is not worn on the hands', 'Gloves, Mittens', ''],
        ['It is worn around the neck', 'It is not worn around the neck', 'Scarf, Tie, Bow Tie', 'Shawl, Cape, Poncho'],
        ['It has sleeves', 'It does not have sleeves', 'Shirt, Blouse, Cardigan, Jacket, Coat, Raincoat, T-Shirt, Hoodie, Bathrobe', 'Dress, Overalls, Swimsuit, Poncho, Cape, Shawl'],
        ['It covers the legs', 'It does not cover the legs', 'Shorts, Jeans, Tights, Leggings', 'Overalls, Skirt, Dress, Socks, Boots, Swimsuit, Bathrobe, Coat, Raincoat, Cape, Poncho']
      ]
    },
    {
      topic: 'Jobs people do',
      cases: [['The Careers Day', 'Thirty visitors came to Careers Day, and only one forgot to bring a name badge. Whose job was it?'],
        ['The Fancy-Dress Party', 'At the fancy-dress party, one guest simply came dressed for their real job. What was it?']],
      options: 'Teacher, Doctor, Nurse, Dentist, Firefighter, Police Officer, Pilot, Chef, Baker, Farmer, Builder, Plumber, Electrician, Carpenter, Painter, Gardener, Mechanic, Librarian, Vet, Astronaut, Scientist, Judge, Artist, Singer, Dancer, Actor, Writer, Photographer, Lifeguard, Hairdresser, Waiter, Cashier, Zookeeper, Sailor, Tailor, Magician',
      facts: [
        ['It looks after people’s health', 'It does not look after people’s health', 'Doctor, Nurse, Dentist', 'Vet, Lifeguard, Scientist, Firefighter'],
        ['It works mostly outdoors', 'It does not work mostly outdoors', 'Farmer, Gardener, Lifeguard, Builder', 'Firefighter, Police Officer, Sailor, Zookeeper, Painter, Photographer, Pilot, Astronaut, Scientist, Artist'],
        ['It works with food', 'It does not work with food', 'Chef, Baker, Waiter', 'Farmer, Cashier, Zookeeper, Scientist'],
        ['It performs on a stage', 'It does not perform on a stage', 'Singer, Dancer, Actor, Magician', 'Artist, Writer, Teacher'],
        ['It fixes or builds things', 'It does not fix or build things', 'Builder, Plumber, Electrician, Carpenter, Mechanic', 'Tailor, Painter, Dentist, Scientist, Gardener, Artist, Doctor'],
        ['It works with animals', 'It does not work with animals', 'Vet, Farmer, Zookeeper', 'Scientist, Magician, Photographer, Police Officer, Chef']
      ]
    },
    {
      topic: 'Musical instruments',
      cases: [['The Silent Orchestra', 'Just before the concert, one instrument vanished from the music room. Which one?'],
        ['The Birthday Serenade', 'Grandad learned to play an instrument in secret for Grandma’s birthday. Which one did he learn?']],
      options: 'Piano, Guitar, Violin, Cello, Harp, Flute, Clarinet, Trumpet, Trombone, Tuba, Saxophone, Drum, Tambourine, Triangle, Xylophone, Recorder, Harmonica, Accordion, Banjo, Ukulele, Bagpipes, Organ, Oboe, Bassoon, French Horn, Double Bass, Maracas, Cymbals, Bongos, Keyboard, Mandolin, Bugle, Castanets, Glockenspiel, Kazoo',
      facts: [
        ['It has strings', 'It does not have strings', 'Guitar, Violin, Cello, Harp, Banjo, Ukulele, Double Bass, Mandolin', 'Piano'],
        ['It is played by blowing into it', 'It is not played by blowing into it', 'Flute, Clarinet, Trumpet, Trombone, Tuba, Saxophone, Recorder, Harmonica, Bagpipes, Oboe, Bassoon, French Horn, Bugle', 'Accordion, Organ, Kazoo'],
        ['It is played by hitting or shaking it', 'It is not played by hitting or shaking it', 'Drum, Tambourine, Triangle, Xylophone, Maracas, Cymbals, Bongos, Castanets, Glockenspiel', 'Piano, Keyboard'],
        ['It has a row of black and white keys', 'It does not have a row of black and white keys', 'Piano, Organ, Keyboard', 'Accordion'],
        ['It is a brass instrument', 'It is not a brass instrument', 'Trumpet, Trombone, Tuba, French Horn, Bugle', 'Saxophone, Cymbals, Triangle, Harmonica, Glockenspiel'],
        ['It is played with a bow', 'It is not played with a bow', 'Violin, Cello, Double Bass', '']
      ]
    },
    {
      topic: 'Vegetables',
      cases: [['The Nibbled Patch', 'Something has been nibbling the vegetable patch, but it only eats one kind of vegetable. Which one?'],
        ['The Soup of the Day', 'The cafe’s famous soup is made from just one vegetable, and the chef will not say which. Can you work it out?']],
      options: 'Carrot, Potato, Onion, Garlic, Leek, Cabbage, Lettuce, Spinach, Broccoli, Cauliflower, Celery, Cucumber, Tomato, Pepper, Pumpkin, Corn, Pea, Bean, Radish, Turnip, Parsnip, Asparagus, Mushroom, Kale, Artichoke, Sweet Potato, Brussels Sprout, Okra, Rhubarb, Watercress, Yam, Squash',
      facts: [
        ['It grows underground', 'It does not grow underground', 'Carrot, Potato, Onion, Garlic, Radish, Turnip, Parsnip, Sweet Potato, Yam', 'Leek'],
        ['It is green', 'It is not green', 'Lettuce, Spinach, Broccoli, Celery, Cucumber, Pea, Kale, Asparagus, Brussels Sprout, Okra, Watercress, Cabbage, Artichoke', 'Leek, Bean, Pepper, Squash, Rhubarb, Tomato, Cauliflower'],
        ['It is orange', 'It is not orange', 'Carrot, Pumpkin', 'Sweet Potato, Squash, Pepper, Yam, Tomato'],
        ['It grows in a pod', 'It does not grow in a pod', 'Pea, Bean, Okra', ''],
        ['It is often eaten raw in a salad', 'It is not often eaten raw in a salad', 'Lettuce, Cucumber, Tomato, Radish, Watercress', 'Spinach, Celery, Pepper, Carrot, Onion, Kale, Corn, Pea, Bean, Cabbage, Broccoli, Mushroom, Cauliflower, Asparagus']
      ]
    },
    {
      topic: 'A day at the beach',
      cases: [['The Sandcastle Surprise', 'When the tide went out, something was found buried inside the biggest sandcastle on the beach. What was it?'],
        ['The Forgotten Beach Bag', 'The family packed up and drove home, but one thing was left behind on the sand. What did they forget?']],
      options: 'Bucket, Spade, Towel, Sunscreen, Sunglasses, Sun Hat, Umbrella, Deckchair, Beach Ball, Swim Ring, Kite, Snorkel, Flippers, Surfboard, Seashell, Pebble, Starfish, Crab, Seaweed, Jellyfish, Seagull, Ice Cream, Sandwich, Picnic Basket, Boat, Lighthouse, Pier, Driftwood, Sandcastle, Flag, Book, Fishing Net',
      facts: [
        ['It is alive', 'It is not alive', 'Starfish, Crab, Jellyfish, Seagull', 'Seaweed, Seashell'],
        ['It is worn on the body', 'It is not worn on the body', 'Sunglasses, Sun Hat, Flippers', 'Snorkel, Sunscreen, Towel, Swim Ring'],
        ['It is something you eat', 'It is not something you eat', 'Ice Cream, Sandwich', 'Crab, Seaweed, Starfish, Seashell'],
        ['It protects you from the sun', 'It does not protect you from the sun', 'Sunscreen, Sunglasses, Sun Hat, Umbrella', 'Towel'],
        ['It lives in the sea', 'It does not live in the sea', 'Starfish, Jellyfish, Seaweed, Crab', 'Seashell, Seagull'],
        ['It is a toy', 'It is not a toy', 'Beach Ball, Kite, Bucket, Spade, Swim Ring', 'Surfboard, Snorkel, Flippers, Fishing Net, Book, Flag, Boat, Sandcastle']
      ]
    },
    {
      topic: 'Things in the garden',
      cases: [['The Muddy Footprints', 'Muddy footprints lead from the garden gate to just one thing in the garden. Where did the visitor stop?'],
        ['The Garden Show', 'The judges at the garden show pinned a gold ribbon on one entry. Which one won?']],
      options: 'Rose, Tulip, Daisy, Sunflower, Daffodil, Lily, Poppy, Lavender, Bluebell, Snowdrop, Pansy, Dandelion, Ivy, Fern, Moss, Oak Tree, Hedge, Lawn, Pond, Bird Bath, Bench, Shed, Greenhouse, Watering Can, Wheelbarrow, Rake, Hose, Trowel, Gnome, Scarecrow, Compost Heap, Swing, Fence, Bird Feeder',
      facts: [
        ['It is a flower', 'It is not a flower', 'Rose, Tulip, Daisy, Sunflower, Daffodil, Lily, Poppy, Lavender, Bluebell, Snowdrop, Pansy, Dandelion', ''],
        ['It is a garden tool', 'It is not a garden tool', 'Watering Can, Wheelbarrow, Rake, Hose, Trowel', ''],
        ['It is usually yellow', 'It is not usually yellow', 'Sunflower, Daffodil, Dandelion', 'Tulip, Rose, Lily, Pansy, Daisy, Poppy, Wheelbarrow, Watering Can, Hose, Gnome, Moss, Lawn, Bird Feeder'],
        ['It is something you can sit on', 'It is not something you can sit on', 'Bench, Swing', 'Wheelbarrow, Fence, Lawn, Bird Bath, Hedge, Compost Heap, Moss, Gnome'],
        ['It holds water', 'It does not hold water', 'Pond, Bird Bath, Watering Can', 'Hose, Wheelbarrow, Greenhouse, Compost Heap, Bird Feeder'],
        ['It is a building', 'It is not a building', 'Shed, Greenhouse', '']
      ]
    },
    {
      topic: 'Sports',
      cases: [['The Trophy Cabinet', 'The school trophy cabinet has one brand-new trophy, but its label has fallen off. Which sport was it for?'],
        ['The Lost Kit Bag', 'A kit bag with no name on it turned up outside the gym. Which sport is the kit for?']],
      options: 'Rugby, Tennis, Golf, Cricket, Baseball, Basketball, Volleyball, Badminton, Hockey, Swimming, Diving, Rowing, Sailing, Surfing, Skiing, Snowboarding, Ice Skating, Cycling, Running, Boxing, Wrestling, Karate, Judo, Fencing, Archery, Bowling, Darts, Table Tennis, Gymnastics, Horse Riding, Climbing, Skateboarding',
      facts: [
        ['It is played with a ball', 'It is not played with a ball', 'Rugby, Tennis, Golf, Cricket, Baseball, Basketball, Volleyball, Table Tennis, Bowling', 'Hockey, Badminton'],
        ['It is done in or on water', 'It is not done in or on water', 'Swimming, Diving, Rowing, Sailing, Surfing', 'Ice Skating, Skiing, Snowboarding, Hockey'],
        ['It needs snow or ice', 'It does not need snow or ice', 'Skiing, Snowboarding, Ice Skating', 'Hockey'],
        ['It is played with a racket', 'It is not played with a racket', 'Tennis, Badminton', 'Table Tennis'],
        ['It is a fighting sport', 'It is not a fighting sport', 'Boxing, Wrestling, Karate, Judo, Fencing', 'Rugby'],
        ['It is played in teams', 'It is not played in teams', 'Rugby, Cricket, Baseball, Basketball, Volleyball, Hockey', 'Rowing, Sailing, Tennis, Badminton, Table Tennis, Cycling, Running, Bowling, Darts, Gymnastics, Swimming, Diving, Golf, Archery, Fencing, Climbing, Horse Riding'],
        ['It is about aiming at a target', 'It is not about aiming at a target', 'Archery, Darts', 'Golf, Bowling, Basketball']
      ]
    },
    {
      topic: 'Birds',
      cases: [['The Doorstep Pecker', 'Something has been pecking at the bread left on the doorstep every morning at dawn. Which bird is the culprit?'],
        ['The Birdwatcher’s Notebook', 'A birdwatcher spotted a rare visitor in the park but smudged its name in her notebook. Which bird did she see?']],
      options: 'Robin, Sparrow, Blackbird, Crow, Raven, Magpie, Pigeon, Dove, Owl, Eagle, Hawk, Falcon, Vulture, Parrot, Canary, Flamingo, Penguin, Ostrich, Emu, Peacock, Swan, Duck, Goose, Chicken, Turkey, Seagull, Pelican, Heron, Stork, Woodpecker, Kingfisher, Hummingbird, Toucan, Puffin, Wren, Cuckoo',
      facts: [
        ['It cannot fly', 'It can fly', 'Penguin, Ostrich, Emu', 'Chicken, Turkey, Peacock'],
        ['It is a bird of prey', 'It is not a bird of prey', 'Owl, Eagle, Hawk, Falcon, Vulture', ''],
        ['It is mostly black', 'It is not mostly black', 'Crow, Raven, Blackbird', 'Magpie, Penguin, Puffin, Vulture, Toucan, Cuckoo, Turkey'],
        ['It is a good swimmer', 'It is not a good swimmer', 'Penguin, Swan, Duck, Goose, Puffin, Pelican', 'Seagull, Flamingo, Heron, Kingfisher, Stork'],
        ['It is kept on farms', 'It is not kept on farms', 'Chicken, Duck, Goose, Turkey', 'Ostrich, Emu, Peacock, Pigeon, Dove'],
        ['It has a very long beak', 'It does not have a very long beak', 'Pelican, Heron, Stork, Toucan', 'Hummingbird, Kingfisher, Woodpecker, Flamingo, Puffin, Seagull, Swan, Goose, Duck, Emu, Ostrich']
      ]
    },
    {
      topic: 'Toys and games',
      cases: [['The Playroom Cupboard', 'Something has vanished from the playroom cupboard, and the twins are blaming each other. What is missing?'],
        ['The Birthday Wish', 'Theo wrote his birthday wish on a note and hid it under his pillow. What did he wish for?']],
      options: 'Teddy Bear, Doll, Kite, Yo-Yo, Jigsaw, Board Game, Marbles, Building Blocks, Toy Car, Train Set, Rocking Horse, Spinning Top, Dominoes, Chess Set, Playing Cards, Balloon, Puppet, Robot, Scooter, Tricycle, Skateboard, Dollhouse, Water Gun, Bouncy Ball, Hula Hoop, Paint Set, Crayons, Toy Soldier, Kaleidoscope, Rubber Duck, Dinosaur',
      facts: [
        ['It has wheels', 'It does not have wheels', 'Toy Car, Train Set, Scooter, Tricycle, Skateboard', 'Robot, Dinosaur'],
        ['It is played at a table with other people', 'It is not played at a table with other people', 'Board Game, Chess Set, Dominoes, Playing Cards', 'Jigsaw, Marbles, Paint Set, Crayons, Building Blocks, Dollhouse, Toy Soldier, Spinning Top'],
        ['It is something you ride on', 'It is not something you ride on', 'Rocking Horse, Scooter, Tricycle, Skateboard', 'Dinosaur, Train Set'],
        ['It is used to draw or paint', 'It is not used to draw or paint', 'Paint Set, Crayons', ''],
        ['It spins round and round', 'It does not spin round and round', 'Spinning Top, Yo-Yo, Hula Hoop', 'Kaleidoscope, Kite, Balloon, Marbles, Bouncy Ball, Toy Car, Train Set, Scooter, Tricycle, Skateboard, Robot, Rubber Duck'],
        ['It is made of lots of small pieces', 'It is not made of lots of small pieces', 'Jigsaw, Building Blocks, Dominoes, Marbles, Chess Set, Playing Cards', 'Board Game, Train Set, Crayons, Paint Set, Toy Soldier, Dollhouse, Robot'],
        ['It looks like a person', 'It does not look like a person', 'Doll, Puppet, Toy Soldier', 'Robot, Teddy Bear, Dollhouse']
      ]
    },
    {
      topic: 'Around the house',
      cases: [['The Spring Clean', 'After the big spring clean, one thing in the house could not be found anywhere. What was it?'],
        ['The Housewarming Gift', 'The family next door brought a housewarming gift for the new home. What did they bring?']],
      options: 'Sofa, Armchair, Bed, Pillow, Blanket, Lamp, Mirror, Clock, Rug, Curtain, Bookcase, Wardrobe, Desk, Chair, Table, Television, Radio, Telephone, Vase, Candle, Picture Frame, Cushion, Bathtub, Shower, Sink, Toothbrush, Soap, Hairbrush, Doormat, Broom, Vacuum Cleaner, Ironing Board, Laundry Basket, Fireplace',
      facts: [
        ['It is usually found in the bathroom', 'It is not usually found in the bathroom', 'Bathtub, Shower, Toothbrush, Soap', 'Sink, Mirror, Hairbrush, Laundry Basket, Candle, Rug'],
        ['It is something you sit on', 'It is not something you sit on', 'Sofa, Armchair, Chair', 'Bed, Cushion, Desk, Table, Bathtub, Rug, Fireplace, Doormat'],
        ['It uses electricity', 'It does not use electricity', 'Lamp, Television, Radio, Vacuum Cleaner', 'Clock, Telephone, Shower, Fireplace, Toothbrush'],
        ['It is soft', 'It is not soft', 'Pillow, Blanket, Cushion', 'Sofa, Armchair, Bed, Rug, Curtain, Doormat, Laundry Basket, Soap'],
        ['It is used for cleaning', 'It is not used for cleaning', 'Soap, Broom, Vacuum Cleaner', 'Toothbrush, Shower, Bathtub, Sink, Hairbrush, Doormat, Laundry Basket, Ironing Board'],
        ['It gives off light', 'It does not give off light', 'Lamp, Candle', 'Television, Fireplace, Telephone, Clock, Radio, Mirror'],
        ['It has legs', 'It does not have legs', 'Chair, Table, Desk, Armchair, Ironing Board', 'Sofa, Bed, Bathtub, Wardrobe, Bookcase, Lamp, Television, Radio, Clock, Fireplace, Laundry Basket, Vase']
      ]
    },
    {
      topic: 'Things in a toolbox',
      cases: [['The Wobbly Shelf', 'Dad wanted to fix the wobbly shelf, but the one thing he needed was gone from the toolbox. What was it?'],
        ['The Borrowed Tool', 'The man next door borrowed something from the toolbox last summer and never brought it back. What was it?']],
      options: 'Hammer, Screwdriver, Pliers, Saw, Hacksaw, Drill, Chisel, File, Sandpaper, Tape Measure, Nail, Screw, Bolt, Washer, Glue, Paintbrush, Paint Roller, Ladder, Pencil, Ruler, Clamp, Mallet, Crowbar, Staple Gun, Masking Tape, Utility Knife, Rope, Bucket, Goggles, Hard Hat, Sponge, Hook',
      facts: [
        ['It is worn to keep you safe', 'It is not worn to keep you safe', 'Goggles, Hard Hat', ''],
        ['It is used for measuring', 'It is not used for measuring', 'Tape Measure, Ruler', 'Pencil, Bucket'],
        ['It is used to hit things', 'It is not used to hit things', 'Hammer, Mallet', 'Crowbar, Chisel'],
        ['It is used for painting', 'It is not used for painting', 'Paintbrush, Paint Roller', 'Masking Tape, Sandpaper, Bucket, Ladder, Sponge'],
        ['It holds things together', 'It does not hold things together', 'Nail, Screw, Bolt, Glue, Clamp, Masking Tape', 'Washer, Rope, Hook, Pliers, Staple Gun'],
        ['It has a sharp edge or point', 'It does not have a sharp edge or point', 'Saw, Hacksaw, Chisel, Nail, Screw, Utility Knife', 'Drill, Staple Gun, Screwdriver, Pliers, File, Pencil, Crowbar, Hook, Sandpaper']
      ]
    },
    {
      topic: 'Sea creatures',
      cases: [['The Glass-Bottom Boat', 'Everyone on the glass-bottom boat cheered when one creature swam right underneath. Which one did they see?'],
        ['The Empty Tank', 'One tank at the aquarium was empty this morning, and the keeper is very puzzled. Who is missing?']],
      options: 'Shark, Whale, Dolphin, Octopus, Squid, Jellyfish, Starfish, Seahorse, Crab, Lobster, Shrimp, Clam, Oyster, Mussel, Seal, Sea Lion, Walrus, Turtle, Eel, Stingray, Swordfish, Tuna, Salmon, Cod, Clownfish, Pufferfish, Coral, Sea Urchin, Sea Otter, Manatee, Orca, Anchovy, Penguin',
      facts: [
        ['It has tentacles', 'It does not have tentacles', 'Octopus, Squid, Jellyfish', 'Coral'],
        ['It has a hard shell', 'It does not have a hard shell', 'Crab, Lobster, Clam, Oyster, Mussel, Turtle', 'Shrimp, Sea Urchin, Starfish, Coral'],
        ['It is a mammal', 'It is not a mammal', 'Whale, Dolphin, Seal, Sea Lion, Walrus, Sea Otter, Manatee, Orca', ''],
        ['It has claws or pincers', 'It does not have claws or pincers', 'Crab, Lobster', 'Shrimp, Sea Otter, Seal, Walrus, Turtle, Sea Lion, Penguin'],
        ['It is a fish', 'It is not a fish', 'Shark, Eel, Stingray, Swordfish, Tuna, Salmon, Cod, Clownfish, Pufferfish, Anchovy', 'Seahorse, Starfish, Jellyfish, Whale, Dolphin, Orca'],
        ['It is often eaten by people', 'It is not often eaten by people', 'Tuna, Salmon, Cod, Shrimp, Lobster, Crab, Clam, Oyster, Mussel, Anchovy', 'Squid, Octopus, Eel, Swordfish, Shark, Sea Urchin, Turtle, Whale, Stingray']
      ]
    },
    {
      topic: 'Sweet treats',
      cases: [['The Bake Sale', 'At the school bake sale, one tray sold out before the doors even opened. What was on it?'],
        ['The Midnight Snack', 'Someone tiptoed down to the kitchen at midnight and ate one sweet treat. What did they eat?']],
      options: 'Cupcake, Brownie, Cookie, Muffin, Pancake, Waffle, Ice Cream, Lollipop, Toffee, Fudge, Marshmallow, Jelly Bean, Gummy Bear, Candy Cane, Chocolate Bar, Cheesecake, Apple Pie, Custard, Meringue, Macaroon, Eclair, Cinnamon Roll, Banana Split, Milkshake, Sundae, Caramel, Gingerbread, Shortbread, Scone, Tart, Honeycomb, Popcorn, Sorbet',
      facts: [
        ['It is served frozen', 'It is not served frozen', 'Ice Cream, Sorbet, Sundae, Banana Split', 'Milkshake, Cheesecake'],
        ['It is baked in an oven', 'It is not baked in an oven', 'Cupcake, Brownie, Cookie, Muffin, Apple Pie, Meringue, Macaroon, Eclair, Cinnamon Roll, Gingerbread, Shortbread, Scone, Tart', 'Cheesecake, Custard, Pancake, Waffle'],
        ['It is a breakfast food', 'It is not a breakfast food', 'Pancake, Waffle', 'Muffin, Cinnamon Roll, Scone, Custard'],
        ['It is a drink', 'It is not a drink', 'Milkshake', 'Custard'],
        ['It is a small sweet you pop in your mouth whole', 'It is not a small sweet you pop in your mouth whole', 'Jelly Bean, Gummy Bear, Toffee, Caramel', 'Fudge, Marshmallow, Macaroon, Honeycomb, Popcorn, Meringue, Cookie, Shortbread, Lollipop, Candy Cane, Brownie, Gingerbread, Cupcake, Muffin, Scone, Tart']
      ]
    },
    {
      topic: 'Christmas',
      cases: [['The Christmas Morning Mix-Up', 'On Christmas morning, one thing was missing from under the tree. What was it?'],
        ['The Last Little Door', 'Behind the last door of the advent calendar was a tiny picture of something festive. What was it?']],
      options: 'Tinsel, Ornament, Star, Angel, Candle, Stocking, Present, Ribbon, Wrapping Paper, Snowman, Snowflake, Sleigh, Reindeer, Elf, Santa, Candy Cane, Gingerbread, Turkey, Cranberry, Chestnut, Holly, Mistletoe, Wreath, Bell, Carol, Chimney, Snow Globe, Nutcracker, Mittens, Scarf, Icicle, Pine Cone, Hot Chocolate',
      facts: [
        ['It is something you eat or drink', 'It is not something you eat or drink', 'Candy Cane, Gingerbread, Turkey, Cranberry, Chestnut, Hot Chocolate', 'Snowflake, Icicle'],
        ['It is a plant', 'It is not a plant', 'Holly, Mistletoe', 'Wreath, Pine Cone, Chestnut, Cranberry'],
        ['It is made of ice or snow', 'It is not made of ice or snow', 'Snowman, Snowflake, Icicle', 'Snow Globe'],
        ['It hangs on the Christmas tree', 'It does not hang on the Christmas tree', 'Tinsel, Ornament, Candy Cane', 'Star, Angel, Bell, Ribbon, Snowflake, Icicle, Gingerbread, Pine Cone, Candle, Nutcracker, Present, Elf, Santa, Reindeer, Snowman, Stocking, Wreath, Sleigh, Snow Globe, Mittens, Holly, Mistletoe, Chestnut, Cranberry'],
        ['It is worn to keep warm', 'It is not worn to keep warm', 'Mittens, Scarf', 'Stocking'],
        ['It makes music or a ringing sound', 'It does not make music or a ringing sound', 'Bell, Carol', 'Sleigh, Nutcracker, Snow Globe, Santa, Elf, Reindeer, Angel']
      ]
    },
    {
      topic: 'Ways to travel',
      cases: [['The Late Arrival', 'Aunt Rosa arrived three hours late to the family reunion and would not say how she got there. How did she travel?'],
        ['The Transport Museum', 'One model in the transport museum has been taken off its stand for cleaning. Which one is it?']],
      options: 'Car, Bus, Taxi, Train, Tram, Bicycle, Motorcycle, Truck, Van, Ambulance, Police Car, Tractor, Bulldozer, Helicopter, Jet, Hot Air Balloon, Rocket, Ship, Ferry, Yacht, Canoe, Kayak, Submarine, Sailboat, Cable Car, Limousine, Hovercraft, Glider, Unicycle, Rickshaw, Gondola, Monorail',
      facts: [
        ['It flies', 'It does not fly', 'Helicopter, Jet, Hot Air Balloon, Rocket, Glider', 'Hovercraft, Cable Car'],
        ['It travels on water', 'It does not travel on water', 'Ship, Ferry, Yacht, Canoe, Kayak, Sailboat, Gondola, Hovercraft', 'Submarine'],
        ['It runs on rails', 'It does not run on rails', 'Train, Tram, Monorail', 'Cable Car, Bulldozer, Tractor'],
        ['It has exactly two wheels', 'It does not have exactly two wheels', 'Bicycle, Motorcycle', 'Rickshaw'],
        ['It rushes to emergencies', 'It does not rush to emergencies', 'Ambulance, Police Car', 'Helicopter'],
        ['It carries lots of passengers at once', 'It does not carry lots of passengers at once', 'Bus, Train, Tram, Ship, Ferry, Monorail', 'Jet, Cable Car, Submarine, Limousine, Hovercraft, Yacht, Helicopter, Hot Air Balloon, Gondola, Rocket'],
        ['It works on a farm or a building site', 'It does not work on a farm or a building site', 'Tractor, Bulldozer', 'Truck, Van']
      ]
    },
    {
      topic: 'Bugs and minibeasts',
      cases: [['The Picnic Invader', 'Something crawled across the picnic blanket and ruined the jam sandwiches. What was it?'],
        ['The Magnifying Glass', 'Through her magnifying glass, Lily spotted a tiny creature on a leaf. What did she see?']],
      options: 'Ant, Bee, Wasp, Hornet, Butterfly, Moth, Beetle, Caterpillar, Spider, Fly, Mosquito, Dragonfly, Grasshopper, Cricket, Snail, Slug, Worm, Centipede, Millipede, Earwig, Flea, Termite, Firefly, Cockroach, Stick Insect, Praying Mantis, Scorpion, Tick, Gnat, Cicada, Silkworm, Aphid',
      facts: [
        ['It has wings', 'It does not have wings', 'Bee, Wasp, Hornet, Butterfly, Moth, Fly, Mosquito, Dragonfly, Firefly, Gnat, Cicada', 'Beetle, Grasshopper, Cricket, Termite, Cockroach, Praying Mantis, Earwig, Aphid, Stick Insect, Ant'],
        ['It has eight legs', 'It does not have eight legs', 'Spider, Scorpion, Tick', ''],
        ['It has no legs at all', 'It has legs', 'Snail, Slug, Worm', 'Silkworm, Caterpillar'],
        ['It can sting', 'It cannot sting', 'Bee, Wasp, Hornet, Scorpion', 'Ant, Mosquito, Centipede, Caterpillar, Spider'],
        ['It feeds on blood', 'It does not feed on blood', 'Mosquito, Flea, Tick', 'Gnat, Fly'],
        ['It has very many legs', 'It does not have very many legs', 'Centipede, Millipede', 'Caterpillar, Silkworm'],
        ['It is famous for jumping', 'It is not famous for jumping', 'Grasshopper, Flea, Cricket', 'Spider, Cicada']
      ]
    },
    {
      topic: 'At school',
      cases: [['The Empty Desk', 'On the first day back, one thing was missing from every desk in the classroom. What was it?'],
        ['The Lost Property Box', 'One item has sat in the lost property box all term, and nobody has claimed it. What is it?']],
      options: 'Pencil, Pen, Ruler, Sharpener, Crayon, Marker, Notebook, Textbook, Dictionary, Calculator, Scissors, Glue Stick, Lunchbox, Water Bottle, Whiteboard, Chalk, Globe, Map, Computer, Locker, Bell, Clock, Paintbrush, Easel, Calendar, Stapler, Paper Clip, Highlighter, Folder, Protractor, Microscope, Pencil Case',
      facts: [
        ['It is used to write or draw with', 'It is not used to write or draw with', 'Pencil, Pen, Crayon, Marker, Chalk, Highlighter, Paintbrush', 'Ruler, Whiteboard, Computer, Notebook'],
        ['It is made of paper', 'It is not made of paper', 'Notebook, Textbook, Dictionary, Map, Calendar, Folder', 'Globe'],
        ['It runs on electricity or batteries', 'It does not run on electricity or batteries', 'Calculator, Computer', 'Clock, Bell, Microscope, Stapler, Sharpener, Whiteboard'],
        ['It is used for measuring', 'It is not used for measuring', 'Ruler, Protractor', 'Clock, Calendar, Water Bottle'],
        ['It holds other things inside it', 'It does not hold other things inside it', 'Lunchbox, Water Bottle, Locker, Folder, Pencil Case', 'Stapler, Sharpener, Computer, Notebook, Textbook, Dictionary, Calculator, Clock, Microscope, Globe, Easel'],
        ['It is used to join papers together', 'It is not used to join papers together', 'Glue Stick, Stapler, Paper Clip', 'Folder']
      ]
    }
  ];

  function list(s) { return String(s || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean); }

  // The packs in the app's own format, checked by the same code as an AI reply.
  var cache = null;
  function packs() {
    if (cache) return cache;
    cache = RAW.map(function (r, i) {
      var res = CX.packs.normalize({
        topic: r.topic,
        cases: r.cases.map(function (c) { return { title: c[0], story: c[1] }; }),
        options: list(r.options),
        facts: r.facts.map(function (f) { return { clue: f[0], not: f[1], yes: list(f[2]), maybe: list(f[3]) }; })
      }, i + 1);
      res.pack.source = 'starter';
      res.pack.id = 's' + String(i + 1).padStart(2, '0') + '-' + res.pack.id.slice(1, 7);
      Object.defineProperty(res.pack, '_notes', { value: res.notes, enumerable: false });
      return res.pack;
    });
    return cache;
  }

  CX.starter = { packs: packs, count: RAW.length };
})(typeof window !== 'undefined' ? window : globalThis);
