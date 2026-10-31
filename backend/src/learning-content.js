"use strict";
const ENGLISH_ACTIVITIES=[
{id:"sp-1",category:"spelling",level:"beginner",prompt:"Choose the correctly spelled word.",options:["Library","Libary","Librery","Liberry"],answerIndex:0,explanation:"Library is spelled L-I-B-R-A-R-Y."},
{id:"sp-2",category:"spelling",level:"intermediate",prompt:"Choose the correctly spelled word.",options:["Occasionally","Ocassionally","Occationally","Occassionaly"],answerIndex:0,explanation:"Occasionally has double c and one s after the first o."},
{id:"vo-1",category:"vocabulary",level:"beginner",prompt:"What does reluctant mean?",options:["Unwilling or hesitant","Very excited","Extremely noisy","Completely certain"],answerIndex:0,explanation:"Reluctant means unwilling or hesitant to do something."},
{id:"vo-2",category:"vocabulary",level:"intermediate",prompt:"Choose the closest synonym of concise.",options:["Brief and clear","Confusing","Very lengthy","Unrelated"],answerIndex:0,explanation:"Concise means expressing something clearly in few words."},
{id:"gr-1",category:"grammar",level:"beginner",prompt:"Choose the grammatically correct sentence.",options:["She goes to school every day.","She go to school every day.","She going to school every day.","She gone to school every day."],answerIndex:0,explanation:"A singular third-person subject takes goes in the simple present tense."},
{id:"gr-2",category:"grammar",level:"intermediate",prompt:"Neither the teacher nor the students ___ absent.",options:["were","was","is","has"],answerIndex:0,explanation:"The verb generally agrees with the nearer subject. Students is plural, so use were."},
{id:"pos-1",category:"parts-of-speech",level:"beginner",prompt:"Identify the part of speech of CHILDREN: The children played outside.",options:["Noun","Verb","Adjective","Adverb"],answerIndex:0,explanation:"Children is a noun because it names people."},
{id:"pos-2",category:"parts-of-speech",level:"beginner",prompt:"Identify the adjective: The bright student answered quickly.",options:["bright","student","answered","quickly"],answerIndex:0,explanation:"Bright describes the noun student, so it is an adjective."},
{id:"fig-1",category:"figures-of-speech",level:"beginner",prompt:"Her smile was as bright as the sun. Which figure of speech is used?",options:["Simile","Metaphor","Irony","Hyperbole"],answerIndex:0,explanation:"A simile compares two things using like or as."},
{id:"fig-2",category:"figures-of-speech",level:"beginner",prompt:"The wind whispered through the trees. Which figure of speech is used?",options:["Personification","Oxymoron","Pun","Euphemism"],answerIndex:0,explanation:"Personification gives a human action to the wind."},
{id:"fig-3",category:"figures-of-speech",level:"intermediate",prompt:"I have told you a million times. Which figure of speech is used?",options:["Hyperbole","Simile","Alliteration","Paradox"],answerIndex:0,explanation:"Hyperbole is deliberate exaggeration for emphasis."},
{id:"oral-1",category:"oral-english",level:"beginner",prompt:"Which pair contains the same initial consonant sound?",options:["thin / think","cat / city","phone / pin","go / giant"],answerIndex:0,explanation:"Thin and think both begin with the voiceless th sound."},
{id:"comp-1",category:"comprehension",level:"beginner",passage:"Mina planned her revision a week before the examination. Each evening, she reviewed one topic and tested herself. When she made a mistake, she returned to the relevant notes.",prompt:"What did Mina do when she made a mistake?",options:["She returned to the relevant notes.","She stopped studying.","She skipped the topic.","She changed schools."],answerIndex:0,explanation:"The passage says she returned to the relevant notes."}
];
const ENGLISH_CATEGORIES=[
{id:"vocabulary",label:"Vocabulary",description:"Meanings, synonyms and antonyms"},
{id:"spelling",label:"Spelling",description:"Recognise and spell words correctly"},
{id:"grammar",label:"Grammar",description:"Build accurate sentences"},
{id:"parts-of-speech",label:"Parts of speech",description:"Understand how words function"},
{id:"figures-of-speech",label:"Figures of speech",description:"Explore literary expression"},
{id:"oral-english",label:"Oral English",description:"Sounds and phonetics"},
{id:"comprehension",label:"Comprehension",description:"Read, interpret and infer"}
];
const ENGLISH_LESSONS=[
{id:"noun",category:"parts-of-speech",title:"Nouns",level:"beginner",body:"A noun names a person, place, thing or idea.",examples:["The teacher explained the lesson.","Lagos is a busy city.","Honesty is valuable."],practice:"Find the noun in: The careful student opened the book."},
{id:"verb",category:"parts-of-speech",title:"Verbs",level:"beginner",body:"A verb expresses an action, occurrence or state of being.",examples:["She writes neatly.","They became friends.","The room is quiet."],practice:"Identify the verb in: The children are reading."},
{id:"adjective",category:"parts-of-speech",title:"Adjectives",level:"beginner",body:"An adjective describes or gives more information about a noun or pronoun.",examples:["A bright idea","A careful driver","An enormous building"],practice:"Which word is the adjective in: a difficult question?"},
{id:"adverb",category:"parts-of-speech",title:"Adverbs",level:"intermediate",body:"An adverb modifies a verb, adjective or another adverb. It can describe how, when, where or degree.",examples:["She spoke softly.","We arrived early.","The test was extremely difficult."],practice:"Identify the adverb in: He answered confidently."},
{id:"simile",category:"figures-of-speech",title:"Simile",level:"beginner",body:"A simile compares different things using like or as.",examples:["Her voice is like music.","He is as brave as a lion."],practice:"Explain the comparison in: The water was as cold as ice."},
{id:"metaphor",category:"figures-of-speech",title:"Metaphor",level:"beginner",body:"A metaphor describes one thing as another to create a direct comparison without like or as.",examples:["Time is a thief.","The classroom was a zoo."],practice:"What does Time is a thief suggest?"},
{id:"personification",category:"figures-of-speech",title:"Personification",level:"intermediate",body:"Personification gives human qualities or actions to animals, objects or abstract ideas.",examples:["The sun smiled at us.","The leaves danced in the wind."],practice:"Identify the human action in: The alarm clock screamed."},
{id:"hyperbole",category:"figures-of-speech",title:"Hyperbole",level:"intermediate",body:"Hyperbole is intentional exaggeration used for emphasis or humour.",examples:["I waited forever.","This bag weighs a ton."],practice:"Why is I have a mountain of homework an exaggeration?"},
{id:"tenses",category:"grammar",title:"Verb tenses",level:"beginner",body:"Tense shows when an action happens: present, past or future.",examples:["I study every day.","I studied yesterday.","I will study tomorrow."],practice:"Change She walks to school into the simple past."},
{id:"concord",category:"grammar",title:"Subject–verb agreement",level:"intermediate",body:"A verb should agree with its subject in number and person.",examples:["The student reads.","The students read.","My friend and I are ready."],practice:"Choose the correct form: The list of topics (is/are) complete."}
];
function getActivity(id){return ENGLISH_ACTIVITIES.find(x=>x.id===id)||null;}
module.exports={ENGLISH_ACTIVITIES,ENGLISH_CATEGORIES,ENGLISH_LESSONS,getActivity};
