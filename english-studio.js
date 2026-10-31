(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const API_BASE = (window.AT_API_BASE || "https://academic-tracker-0b2q.onrender.com").replace(/\/$/, "");
  const token = localStorage.getItem("academic-tracker-token") || "";
  if (!token) { location.replace("login.html"); return; }
  const lessons = {
    vocabulary: { title:"Vocabulary", intro:"A strong vocabulary helps you understand ideas and communicate precisely.", points:[["Meaning","Learn a word's definition before trying to memorise it."],["Word relationships","Compare synonyms, antonyms and related word forms."],["Context","Use surrounding words and the situation to understand unfamiliar terms."],["Usage","Write your own sentence so the word becomes part of your active vocabulary."]], example:"Meticulous means very careful and attentive to detail. Example: He made a meticulous plan." },
    spelling: { title:"Spelling", intro:"Notice word patterns, syllables and common letter combinations.", points:[["Break words into syllables","Say a word slowly and identify its sound parts."],["Learn word families","Related words often share spelling patterns, such as decide and decision."],["Watch common traps","Pay attention to double consonants and silent letters."],["Proofread","Read your writing again and check words you are unsure about."]], example:"Accommodation has double c and double m. Necessary has one c and two s letters." },
    grammar: { title:"Grammar", intro:"Grammar explains how words work together to create clear sentences.", points:[["Concord","The subject and verb must agree: She writes; They write."],["Tenses","Tense places an action in time: present, past or future."],["Clauses","An independent clause can stand alone; a dependent clause cannot."],["Punctuation","Punctuation shows structure, pauses and meaning."]], example:"Although it rained, we continued. This is a complex sentence." },
    partsOfSpeech: { title:"Parts of speech", intro:"Words are grouped by the jobs they perform in a sentence.", points:[["Noun","Names a person, place, thing or idea: student, Lagos, book, honesty."],["Pronoun","Replaces a noun: I, you, she, they, who."],["Verb","Expresses an action or state: write, think, become."],["Adjective","Describes a noun or pronoun: bright, careful, tall."],["Adverb","Modifies a verb, adjective or another adverb: slowly, very."],["Preposition","Shows relationships: in, on, under, between."],["Conjunction","Connects words or clauses: and, but, although."],["Interjection","Expresses sudden feeling: Oh! Wow! Alas!"]], example:"In 'The bright student answered quickly', bright is an adjective and quickly is an adverb." },
    figuresOfSpeech: { title:"Figures of speech", intro:"Figures of speech use language creatively to make meaning vivid or memorable.", points:[["Simile","Compares using like or as: Her voice was like music."],["Metaphor","Describes one thing as another: Time is a thief."],["Personification","Gives human qualities to non-human things: The wind whispered."],["Hyperbole","Uses deliberate exaggeration: I have waited forever."],["Irony","A contrast between expectation and reality or intended meaning."],["Oxymoron","Combines apparently opposite terms: deafening silence."],["Alliteration","Repeats initial consonant sounds: Peter picked purple plums."],["Onomatopoeia","Uses words that imitate sounds: buzz, bang, splash."]], example:"'The stars danced in the sky' is personification because stars are given a human action." },
    comprehension: { title:"Reading comprehension", intro:"Read actively: identify the central idea, supporting evidence and the writer's purpose.", points:[["Preview","Read the title and first lines to predict the subject."],["Find the main idea","Ask what the whole passage is mainly communicating."],["Use evidence","Support answers with details stated or implied in the passage."],["Infer carefully","Combine clues in the passage with reasonable background knowledge."]], example:"A good inference is supported by clues in the passage, not by an unsupported guess." },
    oralEnglish: { title:"Oral English", intro:"Oral English develops accurate speech through sound awareness, syllables and stress.", points:[["Vowels","Vowel sounds are produced without a major blockage of airflow."],["Consonants","Consonant sounds involve a narrowing or closure in the vocal tract."],["Syllables","A syllable is a beat of pronunciation, usually organised around a vowel sound."],["Word stress","One syllable in a word may receive greater emphasis than the others."]], example:"The first sound in cat is /k/. The first sound in city is /s/." },
    writingSkills: { title:"Writing skills", intro:"Clear writing organises ideas for a specific reader and purpose.", points:[["Plan","Identify your purpose, audience and main position before writing."],["Paragraphs","Give each paragraph one central idea supported by relevant details."],["Essay structure","Use an introduction, organised body paragraphs and a conclusion."],["Revision","Check clarity, evidence, grammar, punctuation and paragraph flow."]], example:"A strong argumentative paragraph makes a claim, supports it with evidence and explains why the evidence matters." },
    idiomsAndPhrases: { title:"Idioms and phrases", intro:"Idioms have meanings that are not always obvious from the individual words.", points:[["Learn the whole expression","Memorise the phrase together with its meaning."],["Check the context","An idiom may be informal and unsuitable for some academic writing."],["Use natural examples","Read how the expression fits into a complete sentence."],["Avoid literal interpretation","The intended meaning may be different from the word-for-word meaning."]], example:"'Break the ice' means to make people feel comfortable and begin a conversation." },
    sentenceCorrection: { title:"Sentence correction", intro:"Review sentence structure, agreement, word choice and punctuation.", points:[["Find the subject and verb","Check that they agree in number and person."],["Check verb tense","Keep the time of an action clear and consistent."],["Check pronouns","Make sure each pronoun refers clearly to the right noun."],["Proofread punctuation","Use commas, apostrophes and end marks to make meaning clear."]], example:"Incorrect: He don't know. Correct: He doesn't know." }
  };
  let category = "vocabulary", challenge = null, selections = {}, busy = false;
  async function api(path, options={}) {
    const response = await fetch(API_BASE + path, { ...options, headers: { "Content-Type":"application/json", Authorization:"Bearer "+token, ...(options.headers||{}) } });
    const data = await response.json().catch(()=>({}));
    if (response.status===401) { localStorage.removeItem("academic-tracker-token"); localStorage.removeItem("academic-tracker-user"); location.replace("login.html"); throw new Error("Your session expired. Please sign in again."); }
    if (!response.ok) throw new Error(data.error || "The request could not be completed.");
    return data;
  }
  function lessonPoint(title,body){const item=document.createElement("article");item.className="lesson-point";const strong=document.createElement("strong");strong.textContent=title;const p=document.createElement("p");p.textContent=body;item.append(strong,p);return item;}
  function renderLesson(){
    const lesson=lessons[category];$("lesson-title").textContent=lesson.title;$("lesson-intro").textContent=lesson.intro;
    const root=$("lesson-content");root.replaceChildren();lesson.points.forEach(([title,body])=>root.append(lessonPoint(title,body)));
    const example=document.createElement("div");example.className="lesson-example";example.textContent=lesson.example;root.append(example);
    $("speak-example").dataset.speech=lesson.example;
  }
  function chooseCategory(next){
    if(!lessons[next])return;category=next;challenge=null;selections={};
    document.querySelectorAll("[data-category]").forEach(button=>button.classList.toggle("active",button.dataset.category===category));
    renderLesson();$("question-list").replaceChildren();$("practice-title").textContent="Ready when you are";$("practice-intro").textContent="Review the lesson, then start a five-question practice challenge.";$("practice-result").hidden=true;$("submit-practice").disabled=true;$("practice-message").textContent="Your answers are checked securely.";
  }
  async function startChallenge(){
    $("start-challenge").disabled=true;$("practice-message").textContent="Preparing your questions…";
    try{
      challenge=await api("/api/gamification/english/challenge?category="+encodeURIComponent(category));
      selections={};$("practice-result").hidden=true;$("practice-title").textContent=challenge.title;$("practice-intro").textContent="Choose one answer for each question. Your result and XP are saved to your account.";
      $("practice-count").textContent=challenge.questions.length+" questions";renderQuestions();$("practice-message").textContent="Select an answer for every question.";$("submit-practice").disabled=true;
      $("practice").scrollIntoView({behavior:"smooth",block:"start"});
    }catch(error){$("practice-message").textContent=error.message;}
    finally{$("start-challenge").disabled=false;}
  }
  function renderQuestions(){
    const root=$("question-list");root.replaceChildren();
    challenge.questions.forEach((question,index)=>{
      const card=document.createElement("article");card.className="practice-question";
      const number=document.createElement("p");number.className="question-number";number.textContent="QUESTION "+(index+1);
      const title=document.createElement("h3");title.textContent=question.question;card.append(number,title);
      const options=document.createElement("div");options.className="practice-options";
      question.options.forEach((option,optionIndex)=>{
        const button=document.createElement("button");button.type="button";button.className="practice-option"+(selections[question.id]===optionIndex?" selected":"");
        const letter=document.createElement("span");letter.className="option-letter";letter.textContent=String.fromCharCode(65+optionIndex);
        const label=document.createElement("span");label.textContent=option.text;button.append(letter,label);
        button.addEventListener("click",()=>{if(busy)return;selections[question.id]=optionIndex;renderQuestions();$("submit-practice").disabled=Object.keys(selections).length!==challenge.questions.length;});
        options.append(button);
      });
      card.append(options);root.append(card);
    });
  }
  async function submitChallenge(){
    if(!challenge||busy)return;
    if(Object.keys(selections).length!==challenge.questions.length){$("practice-message").textContent="Answer every question before submitting.";return;}
    busy=true;$("submit-practice").disabled=true;$("submit-practice").textContent="Checking answers…";
    try{
      const data=await api("/api/gamification/english/submit",{method:"POST",body:JSON.stringify({challengeId:challenge.challengeId,answers:challenge.questions.map(question=>({questionId:question.id,optionIndex:selections[question.id]}))})});
      $("practice-result").hidden=false;$("practice-result").replaceChildren();
      const heading=document.createElement("h3");heading.textContent=data.percentage>=80?"Excellent progress!":data.percentage>=50?"Good effort. Keep practising.":"A useful first attempt.";
      const summary=document.createElement("p");summary.textContent="You got "+data.correct+" out of "+data.total+" correct ("+data.percentage+"%). You earned "+data.xpAwarded+" XP.";
      const review=document.createElement("div");review.className="practice-review";
      data.review.forEach((item,index)=>{
        const row=document.createElement("article");const q=document.createElement("strong");q.textContent=(index+1)+". "+item.question;
        const result=document.createElement("p");result.textContent=(item.isCorrect?"Correct. ":"Review this one. ")+" "+item.explanation;row.append(q,result);review.append(row);
      });
      const levelLink=document.createElement("a");levelLink.href="level-up.html";levelLink.textContent="View your level and achievements →";levelLink.style.cssText="display:inline-block;margin-top:12px;color:#C4B5FD;font-size:11px;font-weight:800";
      $("practice-result").append(heading,summary,review,levelLink);
      $("practice-message").textContent="Your result has been saved. Start another challenge whenever you're ready.";
      $("submit-practice").textContent="Challenge completed";
      document.querySelectorAll(".practice-option").forEach(button=>button.disabled=true);
    }catch(error){$("practice-message").textContent=error.message;$("submit-practice").disabled=false;$("submit-practice").textContent="Try submitting again";}
    finally{busy=false;}
  }
  function speak(text,locale="en-GB"){
    if(!("speechSynthesis" in window)){ $("practice-message").textContent="Speech playback is not available in this browser.";return; }
    window.speechSynthesis.cancel();const utterance=new SpeechSynthesisUtterance(text);utterance.lang=locale;utterance.rate=.88;window.speechSynthesis.speak(utterance);
  }
  document.querySelectorAll("[data-category]").forEach(button=>button.addEventListener("click",()=>chooseCategory(button.dataset.category)));
  $("start-challenge").addEventListener("click",startChallenge);
  $("submit-practice").addEventListener("click",submitChallenge);
  $("speak-word").addEventListener("click",()=>speak("Meticulous"));
  $("pronounce-custom").addEventListener("click",()=>{const word=$("pronounce-input").value.trim();if(!word){$("practice-message").textContent="Enter a word to hear its pronunciation.";return;}if(word.length>120){$("practice-message").textContent="Keep the word or phrase under 120 characters.";return;}speak(word,$("pronounce-accent").value);});
  $("speak-example").addEventListener("click",()=>speak(lessons[category].example));
  $("english-signout").addEventListener("click",async()=>{try{await api("/api/auth/logout",{method:"POST"});}catch{}localStorage.removeItem("academic-tracker-token");localStorage.removeItem("academic-tracker-user");location.replace("login.html");});

  const curatedStories = [
    { id:"curated-river", source:"curated", title:"The River That Remembered", genre:"Folktale", readingLevel:"Intermediate", estimatedMinutes:4, content:"In a small village, a river flowed beside the farms. Every morning, Amara visited it with a clay pot. She noticed that the river carried fallen leaves, tiny seeds and stories from the hills.\n\nOne dry season, the villagers argued about who should use the remaining water. Amara suggested that they meet beneath the oldest tree and listen to one another. The farmers discovered that they could take turns and repair the narrow channels together.\n\nBy working as a team, they protected their crops and the riverbank. Amara learned that a community becomes stronger when people share responsibility instead of blaming one another.", vocabulary:[{word:"clay",partOfSpeech:"noun",meaning:"A soft natural material used to make pots and bricks.",example:"Amara carried water in a clay pot."},{word:"remaining",partOfSpeech:"adjective",meaning:"Still left after some has been used.",example:"They shared the remaining water."},{word:"channels",partOfSpeech:"noun",meaning:"Narrow passages through which water flows.",example:"The farmers repaired the water channels."},{word:"responsibility",partOfSpeech:"noun",meaning:"A duty or task that someone is expected to take care of.",example:"Everyone shared responsibility for the river."}],questions:[{question:"Why did the villagers meet beneath the oldest tree?",answer:"They met to discuss how to share the limited water fairly."},{question:"What solution did Amara suggest?",answer:"She suggested taking turns and repairing the water channels together."},{question:"What lesson did Amara learn?",answer:"A community grows stronger when people cooperate and share responsibility."}]},
    { id:"curated-clock", source:"curated", title:"The Clockmaker's Small Discovery", genre:"Mystery", readingLevel:"Intermediate", estimatedMinutes:4, content:"Tunde loved visiting his aunt's repair shop. One afternoon, he heard a soft ticking from a wooden box that had been silent for years. His aunt explained that the box belonged to a clockmaker who had worked in the town long ago.\n\nInside, Tunde found a note beside a tiny brass wheel. The note said, 'A patient eye notices what a hurried hand misses.' He examined the wheel and saw a small piece of dust trapped between its teeth.\n\nAfter cleaning it carefully, the mechanism began to move. The old clock did not tell the correct time, but it had started again. Tunde realised that careful observation can be more useful than rushing to find an answer.", vocabulary:[{word:"mechanism",partOfSpeech:"noun",meaning:"A group of parts working together in a machine.",example:"The mechanism began to move."},{word:"brass",partOfSpeech:"noun",meaning:"A yellowish metal made mainly from copper and zinc.",example:"A tiny brass wheel was inside the box."},{word:"examined",partOfSpeech:"verb",meaning:"Looked at something carefully to understand it.",example:"Tunde examined the wheel."},{word:"observation",partOfSpeech:"noun",meaning:"The act of watching or noticing something carefully.",example:"Careful observation helped Tunde find the problem."}],questions:[{question:"What made Tunde investigate the wooden box?",answer:"He heard a soft ticking sound from a box that had been silent for years."},{question:"What stopped the mechanism from moving?",answer:"A small piece of dust was trapped between the teeth of the wheel."},{question:"What lesson did Tunde learn?",answer:"Careful observation can be more useful than rushing."}]}
  ];
  function storyElement(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;}
  function renderStoryCard(story){
    const card=document.createElement("article");card.className="story-card";
    const meta=storyElement("p","story-meta",(story.source==="ai"?"✦ AI GENERATED":"✦ CURATED")+" · "+(story.genre||"Story"));
    const title=storyElement("h4","",story.title);
    const detail=storyElement("p","story-card-detail",(story.estimatedMinutes||4)+" min read · "+(story.readingLevel||"Intermediate"));
    const open=document.createElement("button");open.type="button";open.className="story-open";open.textContent="Read story →";open.addEventListener("click",()=>openStory(story));
    card.append(meta,title,detail,open);return card;
  }
  function openStory(story){
    const reader=$("story-reader");reader.hidden=false;reader.replaceChildren();
    const top=document.createElement("div");top.className="story-reader-top";
    const heading=storyElement("h3","",story.title);const close=document.createElement("button");close.type="button";close.className="story-close";close.textContent="Close";close.addEventListener("click",()=>{reader.hidden=true;});
    top.append(heading,close);
    const meta=storyElement("p","story-meta",(story.genre||"Story")+" · "+(story.estimatedMinutes||4)+" min read · "+(story.source==="ai"?"AI generated":"Curated"));
    const listen=document.createElement("button");listen.type="button";listen.className="story-listen";listen.textContent="▶ Listen to story";listen.addEventListener("click",()=>speak(story.content));
    const body=document.createElement("div");body.className="story-text";
    String(story.content||"").split(/\n\\s*\n/).filter(Boolean).forEach(paragraph=>body.append(storyElement("p","",paragraph)));
    const vocabHeading=storyElement("h4","story-subheading","Vocabulary to notice");
    const vocab=document.createElement("div");vocab.className="story-vocabulary";
    (story.vocabulary||[]).forEach(item=>{const row=document.createElement("article");row.className="story-vocab-item";row.append(storyElement("strong","",item.word+" · "+(item.partOfSpeech||"word")),storyElement("p","",item.meaning),storyElement("small","",item.example));vocab.append(row);});
    const questionHeading=storyElement("h4","story-subheading","Check your understanding");
    const questions=document.createElement("div");questions.className="story-questions";
    (story.questions||[]).forEach((item,index)=>{const details=document.createElement("details");const summary=storyElement("summary","",(index+1)+". "+item.question);details.append(summary,storyElement("p","",item.answer));questions.append(details);});
    reader.append(top,meta,listen,body,vocabHeading,vocab,questionHeading,questions);
    reader.scrollIntoView({behavior:"smooth",block:"start"});
  }
  async function loadStories(){
    const root=$("story-library");root.replaceChildren();
    curatedStories.forEach(story=>root.append(renderStoryCard(story)));
    try{
      const data=await api("/api/gamification/english/stories");
      const saved=Array.isArray(data.stories)?data.stories:[];
      saved.forEach(story=>root.append(renderStoryCard({...story,source:"ai"})));
      $("story-count").textContent=(curatedStories.length+saved.length)+" stories";
    }catch(error){$("story-count").textContent="Curated stories available · "+error.message;}
  }
  async function generateStory(){
    const topic=$("story-topic").value.trim();const genre=$("story-genre").value;
    if(topic.length<3){$("story-status").textContent="Enter a topic with at least 3 characters.";return;}
    const button=$("generate-story");button.disabled=true;button.textContent="Creating your story…";$("story-status").textContent="AI is writing an original story and checking its vocabulary…";
    try{
      const data=await api("/api/ai",{method:"POST",body:JSON.stringify({action:"story",topic:genre+": "+topic})});
      if(!data.story||!data.story.title||!data.story.content)throw new Error("The story response was incomplete. Please try again.");
      $("story-status").textContent="Your story has been saved to your account. "+(data.creditUsage?"Credits used: "+data.creditUsage.charged+".":"");
      const story={...data.story,source:"ai"};$("story-library").prepend(renderStoryCard(story));$("story-count").textContent=$("story-library").children.length+" stories";openStory(story);
    }catch(error){$("story-status").textContent=error.message;}
    finally{button.disabled=false;button.textContent="✦ Generate my story · 3 credits";}
  }
  $("generate-story").addEventListener("click",generateStory);

  renderLesson();
  loadStories();
})();