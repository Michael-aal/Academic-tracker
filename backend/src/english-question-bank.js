const BANK = {
  vocabulary: [
    { id: "v1", question: "Which word is closest in meaning to 'diligent'?", options: ["Careless", "Hardworking", "Noisy", "Impatient"], answer: 1, explanation: "Diligent means showing steady, careful effort." },
    { id: "v2", question: "What is the opposite of 'scarce'?", options: ["Rare", "Limited", "Abundant", "Insufficient"], answer: 2, explanation: "Abundant means available in large quantities." },
    { id: "v3", question: "Which word means 'to make something clearer'?", options: ["Clarify", "Obscure", "Delay", "Reject"], answer: 0, explanation: "To clarify is to make an idea easier to understand." },
    { id: "v4", question: "Choose the correctly used word: 'The medicine had an ___ effect.'", options: ["Affect", "Effective", "Effect", "Affected"], answer: 2, explanation: "Effect is a noun meaning a result. 'An effect' is correct here." }
  ],
  spelling: [
    { id: "s1", question: "Choose the correctly spelled word.", options: ["Accomodation", "Accommodation", "Acommodation", "Accommmodation"], answer: 1, explanation: "Accommodation has double c and double m." },
    { id: "s2", question: "Choose the correctly spelled word.", options: ["Separate", "Seperate", "Seperete", "Separete"], answer: 0, explanation: "The correct spelling is separate." },
    { id: "s3", question: "Choose the correctly spelled word.", options: ["Pronounciation", "Pronunciation", "Pronunciaton", "Pronounciaton"], answer: 1, explanation: "Pronunciation is spelled without the second o after n." },
    { id: "s4", question: "Choose the correctly spelled word.", options: ["Necessary", "Neccessary", "Necesary", "Necassary"], answer: 0, explanation: "Necessary has one c and two s letters." }
  ],
  grammar: [
    { id: "g1", question: "Choose the sentence with correct subject–verb agreement.", options: ["She go to school.", "She goes to school.", "She going to school.", "She have gone to school."], answer: 1, explanation: "A singular third-person subject takes 'goes' in the simple present." },
    { id: "g2", question: "Which sentence is in the past perfect tense?", options: ["I have eaten.", "I eat early.", "I had eaten before noon.", "I was eating."], answer: 2, explanation: "Past perfect uses had + past participle." },
    { id: "g3", question: "Choose the correct preposition: 'The book is ___ the table.'", options: ["At", "On", "Into", "Between"], answer: 1, explanation: "'On' describes something resting on a surface." },
    { id: "g4", question: "Which is a complex sentence?", options: ["The bell rang.", "I came and I saw.", "Although it rained, we continued.", "Please sit down."], answer: 2, explanation: "A complex sentence contains an independent clause and a dependent clause." }
  ],
  partsOfSpeech: [
    { id: "p1", question: "In 'The bright moon shone', which part of speech is 'bright'?", options: ["Noun", "Verb", "Adjective", "Adverb"], answer: 2, explanation: "Bright describes the noun moon, so it is an adjective." },
    { id: "p2", question: "Which word is a conjunction?", options: ["Quickly", "Although", "Beautiful", "Across"], answer: 1, explanation: "Although joins a dependent clause to another clause." },
    { id: "p3", question: "In 'They spoke softly', what is 'softly'?", options: ["Adverb", "Adjective", "Pronoun", "Preposition"], answer: 0, explanation: "Softly modifies the verb spoke." },
    { id: "p4", question: "Which word is a pronoun?", options: ["Teacher", "Carefully", "They", "Under"], answer: 2, explanation: "They is a personal pronoun." }
  ],
  figuresOfSpeech: [
    { id: "f1", question: "'Her smile was like sunshine' is an example of:", options: ["Metaphor", "Simile", "Irony", "Pun"], answer: 1, explanation: "A simile compares two things using 'like' or 'as'." },
    { id: "f2", question: "'The wind whispered through the trees' uses:", options: ["Personification", "Hyperbole", "Oxymoron", "Euphemism"], answer: 0, explanation: "Personification gives a human action to a non-human thing." },
    { id: "f3", question: "'I have told you a million times' is:", options: ["Alliteration", "Hyperbole", "Metonymy", "Paradox"], answer: 1, explanation: "Hyperbole is deliberate exaggeration for emphasis." },
    { id: "f4", question: "'The silence was deafening' is commonly classified as:", options: ["Oxymoron", "Simile", "Onomatopoeia", "Apostrophe"], answer: 0, explanation: "Oxymoron places apparently contradictory terms together." }
  ],
  comprehension: [
    { id: "c1", question: "In a reading passage, the 'main idea' is:", options: ["The longest sentence", "The central point", "A difficult word", "The final punctuation mark"], answer: 1, explanation: "The main idea is the central message or point of a passage." },
    { id: "c2", question: "A conclusion is best supported by:", options: ["A random guess", "Evidence from the passage", "The title alone", "An unrelated opinion"], answer: 1, explanation: "Good comprehension answers are supported by details in the text." },
    { id: "c3", question: "What does an inference require?", options: ["Copying every sentence", "Combining clues with prior knowledge", "Ignoring context", "Choosing the longest option"], answer: 1, explanation: "An inference is a reasonable conclusion drawn from clues and knowledge." },
    { id: "c4", question: "The tone of a passage refers mainly to:", options: ["The writer's attitude", "The page size", "The number of paragraphs", "The font used"], answer: 0, explanation: "Tone communicates the writer's attitude toward the subject." }
  ],
  oralEnglish: [
    { id: "o1", question: "Which pair contains two vowel sounds?", options: ["/p/ and /b/", "/iː/ and /æ/", "/t/ and /d/", "/s/ and /z/"], answer: 1, explanation: "The symbols /iː/ and /æ/ represent vowel sounds." },
    { id: "o2", question: "Which word has a different initial consonant sound?", options: ["City", "Cent", "Cycle", "Cat"], answer: 3, explanation: "Cat begins with /k/, while the c in the other words represents /s/." },
    { id: "o3", question: "A syllable is best described as:", options: ["A unit of spoken sound organised around a vowel", "A punctuation mark", "A complete paragraph", "A silent letter"], answer: 0, explanation: "A syllable is a beat or unit of pronunciation, usually centred on a vowel sound." },
    { id: "o4", question: "Word stress is:", options: ["The loudest letter", "The emphasis placed on a syllable", "A spelling error", "A pause between paragraphs"], answer: 1, explanation: "Word stress is the emphasis given to one syllable in a word." }
  ]
};

function categories() {
  return Object.keys(BANK);
}
function makeChallenge(category, count = 5) {
  const key = categories().includes(category) ? category : "vocabulary";
  const source = [...BANK[key]];
  for (let i = source.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [source[i], source[j]] = [source[j], source[i]];
  }
  return source.slice(0, Math.min(Math.max(1, count), source.length));
}
module.exports = { BANK, categories, makeChallenge };
