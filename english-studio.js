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
  $("speak-example").addEventListener("click",()=>speak(lessons[category].example));
  $("english-signout").addEventListener("click",async()=>{try{await api("/api/auth/logout",{method:"POST"});}catch{}localStorage.removeItem("academic-tracker-token");localStorage.removeItem("academic-tracker-user");location.replace("login.html");});
  renderLesson();
})();