"use strict";
/* Unlocked Phase 1 — content library (no AI). Classic script: top-level
   vars/functions become globals shared with engine.js / renderers.js / features.js. */

var SAMPLE_TOPICS = [
{
  id: "photosynthesis",
  title: "Photosynthesis",
  image: "/src/assets/images/topic_biosphere_pond_1795446684225.jpg",
  art: "photosynthesis",
  summary: "How plants convert light energy, water and carbon dioxide into glucose and oxygen.",
  classification: "process, structure, quant",
  concepts: [
    { id: "chloroplast", name: "Chloroplast", def: "The organelle where photosynthesis takes place.", kind: "structure" },
    { id: "chlorophyll", name: "Chlorophyll", def: "The green pigment that absorbs light energy.", kind: "structure" },
    { id: "light", name: "Light energy", def: "Sunlight captured by chlorophyll to drive the reactions.", kind: "input" },
    { id: "water", name: "Water", def: "Split during the light reactions; provides electrons and hydrogen ions.", kind: "input" },
    { id: "co2", name: "Carbon dioxide", def: "The carbon source fixed into glucose in the Calvin cycle.", kind: "input" },
    { id: "glucose", name: "Glucose", def: "The sugar produced; stores chemical energy for the plant.", kind: "output" },
    { id: "oxygen", name: "Oxygen", def: "Released as a by-product when water is split.", kind: "output" },
    { id: "thylakoid", name: "Thylakoid", def: "Membrane inside the chloroplast where the light reactions occur.", kind: "structure" },
    { id: "stroma", name: "Stroma", def: "The fluid around the thylakoids where the Calvin cycle occurs.", kind: "structure" },
    { id: "calvin", name: "Calvin cycle", def: "The reactions that fix CO2 into glucose using ATP and NADPH.", kind: "process" }
  ],
  relationships: [
    { from: "chloroplast", to: "chlorophyll", label: "contains" },
    { from: "chloroplast", to: "thylakoid", label: "contains" },
    { from: "chloroplast", to: "stroma", label: "contains" },
    { from: "chlorophyll", to: "light", label: "absorbs" },
    { from: "thylakoid", to: "light", label: "captures" },
    { from: "light", to: "water", label: "splits" },
    { from: "water", to: "oxygen", label: "releases" },
    { from: "stroma", to: "calvin", label: "hosts" },
    { from: "co2", to: "calvin", label: "fixed in" },
    { from: "calvin", to: "glucose", label: "produces" }
  ],
  process: [
    { t: "Capture", d: "Chlorophyll absorbs sunlight in the thylakoid membranes." },
    { t: "Split", d: "Light energy splits water, releasing oxygen and providing electrons." },
    { t: "Convert", d: "The light reactions produce ATP and NADPH (energy carriers)." },
    { t: "Fix", d: "In the stroma, the Calvin cycle uses ATP and NADPH to fix CO2." },
    { t: "Build", d: "Fixed carbon is assembled into glucose." }
  ],
  graph: {
    labels: ["0", "20", "40", "60", "80", "100"],
    series: [
      { name: "Photosynthesis rate", color: "#7EA85B", data: [0, 14, 30, 46, 58, 62] },
      { name: "Light intensity", color: "#F2B44B", data: [0, 20, 40, 60, 80, 100], dashed: true }
    ],
    xlabel: "Light intensity (%)", ylabel: "Rate (relative)"
  },
  story: {
    title: "A carbon dioxide molecule's journey",
    scenes: [
      { t: "Arrival", d: "A CO2 molecule drifts toward a leaf on a bright morning." },
      { t: "Entry", d: "It passes through a stoma, a tiny adjustable pore on the leaf surface." },
      { t: "Delivery", d: "It diffuses into a chloroplast and reaches the stroma." },
      { t: "Capture", d: "In the Calvin cycle, the carbon is attached using energy from ATP." },
      { t: "Build", d: "After several turns, the carbon becomes part of a glucose molecule." },
      { t: "Purpose", d: "That glucose stores energy the plant uses to grow, repair and reproduce." }
    ]
  },
  diagram: {
    inputs: [{ label: "Light", color: "#F2B44B" }, { label: "Water", color: "#558E9B" }, { label: "CO2", color: "#558E9B" }],
    outputs: [{ label: "Glucose", color: "#7EA85B" }, { label: "Oxygen", color: "#7EA85B" }],
    center: "Chloroplast", centerSub: "light reactions to Calvin cycle"
  },
  worked: [
    { t: "Identify inputs", d: "Photosynthesis needs light, water and carbon dioxide." },
    { t: "Locate the site", d: "Chloroplast: light reactions in the thylakoid, Calvin cycle in the stroma." },
    { t: "Follow the energy", d: "Light excites chlorophyll; water is split (releasing O2); ATP and NADPH are made." },
    { t: "Build the product", d: "The Calvin cycle uses ATP and NADPH to fix CO2 into glucose." },
    { t: "State the output", d: "Outputs are glucose (stored energy) and oxygen (by-product)." }
  ],
  guide: [
    { q: "The green pigment that absorbs light is called ______.", a: "chlorophyll", hint: "It's what makes leaves green." },
    { q: "The organelle where photosynthesis occurs is the ______.", a: "chloroplast", hint: "It contains thylakoids and stroma." },
    { q: "The sugar produced for energy storage is ______.", a: "glucose", hint: "A 6-carbon sugar." }
  ],
  hint: {
    question: "Why does a plant kept in the dark eventually stop growing?",
    hints: ["Think about which input is missing.", "Light is required for the light-dependent reactions.", "No light means no ATP/NADPH, so the Calvin cycle cannot fix CO2 into glucose."],
    keywords: [{ re: /light/, msg: "light" }, { re: /(glucose|grow|food|energy|photosynth|atp|calvin)/, msg: "glucose production" }],
    answerHtml: "Correct: without light the light reactions stop, so no ATP/NADPH is made and the Calvin cycle cannot build glucose. The plant can no longer make food."
  },
  explain: {
    prompt: "Explain how a plant turns light, water and CO2 into glucose.",
    keywords: [{ re: /light|sun/, msg: "light" }, { re: /water/, msg: "water" }, { re: /co2|carbon dioxide/, msg: "carbon dioxide" },
      { re: /chloroplast|thylakoid|stroma/, msg: "the chloroplast" }, { re: /glucose|sugar/, msg: "glucose" }, { re: /oxygen|o2/, msg: "oxygen" }],
    minCorrect: 4
  },
  predict: {
    prompt: "If a plant is moved from bright light to darkness, what happens to its rate of photosynthesis, and why?",
    revealHtml: "Making a prediction before seeing the answer improves later recall. You will test this in the Experiment stage."
  },
  hook: { prompt: "Two plants get the same water and soil. One sits in sunlight, one in a dark cupboard. After a week, one is thriving and one is pale and weak. Why? Jot down your first idea." },
  evidence: {
    prompt: "Which explanation best fits the evidence?",
    options: ["Plants need light to make food, so low light limits growth.", "Plants only need water and soil, so light is irrelevant.", "Plants grow better in the dark to save energy."],
    answer: 0, why: "Light is a required input for photosynthesis; the dark plant cannot make food."
  },
  challenge: {
    prompt: "A greenhouse is kept at low light and the plants grow poorly. Using photosynthesis, propose two changes and explain why each would help.",
    keywords: [{ re: /light|sun|lamp|bright/, msg: "more light" }, { re: /co2|carbon dioxide|ventilat/, msg: "more CO2" }, { re: /water|irriga|hydrat/, msg: "water" }],
    minCorrect: 2, why: "Photosynthesis needs light, water and CO2; increasing any limiting input raises the rate."
  },
  game: {
    title: "Greenhouse manager", unit: "growth", kind: "limiting", target: 0,
    goal: "Balance light, water and CO2. Growth depends on the limiting input: improving one while another is scarce has little effect.",
    sliders: [{ id: "light", label: "Light" }, { id: "water", label: "Water" }, { id: "co2", label: "CO2" }]
  },
  quiz: [
    { q: "Where in the chloroplast do the light-dependent reactions occur?", opts: ["Stroma", "Thylakoid membrane", "Cytoplasm", "Nucleus"], a: 1, why: "The thylakoid membranes hold chlorophyll and host the light reactions." },
    { q: "Which gas is released when water is split?", opts: ["Carbon dioxide", "Nitrogen", "Oxygen", "Methane"], a: 2, why: "Splitting water releases oxygen as a by-product." },
    { q: "What is the main product of the Calvin cycle?", opts: ["Oxygen", "ATP", "Glucose", "Chlorophyll"], a: 2, why: "The Calvin cycle fixes CO2 into glucose using ATP and NADPH." },
    { q: "Why are both light reactions and the Calvin cycle needed?", opts: ["To produce two types of oxygen", "To capture energy and then use it to build glucose", "Because one works only at night", "They are alternative pathways"], a: 1, why: "Light reactions capture energy; the Calvin cycle uses it to build glucose." },
    { q: "A plant is kept in the dark for two days. What happens to photosynthesis?", opts: ["It speeds up", "It continues unchanged", "It slows or stops because light is a required input", "It switches to using soil sugar"], a: 2, why: "Light is a required input; without it the light reactions cannot proceed." }
  ],
  misconceptions: [
    { wrong: "Plants get their food from the soil.", right: "Plants make their own food (glucose) through photosynthesis; soil mainly provides water and minerals." },
    { wrong: "Plants do not respire.", right: "Plants respire day and night, just like other living things." }
  ]
},
{
  id: "newton2",
  title: "Newton's Second Law",
  image: "/src/assets/images/topic_canyon_cart_1795446680560.jpg",
  art: "newton2",
  summary: "Force, mass and acceleration are linked by F = m x a. Net force determines acceleration.",
  classification: "quant, procedure",
  concepts: [
    { id: "force", name: "Force", def: "A push or pull, measured in newtons (N).", kind: "input" },
    { id: "mass", name: "Mass", def: "The amount of matter in kilograms (kg). It resists acceleration.", kind: "property" },
    { id: "acceleration", name: "Acceleration", def: "The rate of change of velocity, measured in m/s2.", kind: "output" },
    { id: "netforce", name: "Net force", def: "The vector sum of all forces acting on an object.", kind: "concept" },
    { id: "friction", name: "Friction", def: "A force that opposes relative motion between surfaces.", kind: "concept" },
    { id: "newton", name: "Newton", def: "The SI unit of force; 1 N accelerates 1 kg at 1 m/s2.", kind: "unit" }
  ],
  relationships: [
    { from: "force", to: "acceleration", label: "causes" },
    { from: "mass", to: "acceleration", label: "resists" },
    { from: "friction", to: "netforce", label: "opposes" },
    { from: "netforce", to: "acceleration", label: "determines" },
    { from: "force", to: "newton", label: "measured in" }
  ],
  process: [
    { t: "Identify", d: "List all forces acting on the object." },
    { t: "Net", d: "Compute the net force (sum, with direction)." },
    { t: "Apply", d: "Use F = m x a to relate net force, mass and acceleration." },
    { t: "Solve", d: "Rearrange to find the unknown quantity." },
    { t: "Check", d: "Check units and whether the direction makes sense." }
  ],
  graph: {
    labels: ["0", "2", "4", "6", "8", "10"],
    series: [
      { name: "Acceleration (m/s2)", color: "#7EA85B", data: [0, 1, 2, 3, 4, 5] },
      { name: "Force (N)", color: "#F2B44B", data: [0, 2, 4, 6, 8, 10], dashed: true }
    ],
    xlabel: "Force (N) - mass fixed at 2 kg", ylabel: "Acceleration (m/s2)"
  },
  story: {
    title: "Pushing the delivery cart",
    scenes: [
      { t: "Empty cart", d: "A worker pushes an empty cart; it speeds up quickly." },
      { t: "Load it", d: "They load it with boxes; the same push now accelerates it less." },
      { t: "Push harder", d: "They push harder; acceleration increases again." },
      { t: "Friction", d: "Friction acts against motion, so part of the push is used up." },
      { t: "Net force", d: "Only the net force (push minus friction) determines acceleration." },
      { t: "Result", d: "a = F_net / m: more force or less mass means more acceleration." }
    ]
  },
  diagram: {
    inputs: [{ label: "Net force", color: "#F2B44B" }], outputs: [{ label: "Acceleration", color: "#558E9B" }],
    center: "Object (mass m)", centerSub: "F_net = m x a"
  },
  worked: [
    { t: "Given", d: "A 4 kg cart is pushed with a net force of 12 N." },
    { t: "Equation", d: "F = m x a, so a = F / m." },
    { t: "Substitute", d: "a = 12 N / 4 kg." },
    { t: "Compute", d: "a = 3 m/s2." },
    { t: "Interpret", d: "The cart's velocity increases by 3 m/s each second." }
  ],
  guide: [
    { q: "The equation linking force, mass and acceleration is F = ______.", a: "ma", hint: "mass times acceleration." },
    { q: "The unit of force is the ______.", a: "newton", hint: "Named after the scientist." },
    { q: "Acceleration is measured in ______.", a: "m/s2", hint: "metres per second squared." }
  ],
  hint: {
    question: "A box slides at constant velocity. What is the net force on it?",
    hints: ["Constant velocity means acceleration is zero.", "Use F = m x a with a = 0.", "If a = 0, then net force = 0."],
    keywords: [{ re: /zero|\b0\b/, msg: "zero" }, { re: /net|force|balanced/, msg: "net force" }],
    answerHtml: "Correct: constant velocity means zero acceleration, so by F = m x a the net force is zero (forces are balanced)."
  },
  explain: {
    prompt: "Explain Newton's second law in your own words, including force, mass and acceleration.",
    keywords: [{ re: /force/, msg: "force" }, { re: /mass/, msg: "mass" }, { re: /accelerat/, msg: "acceleration" }, { re: /net/, msg: "net force" }, { re: /f\s*=\s*ma|f\s*\/\s*m|\bma\b/, msg: "F = m x a" }],
    minCorrect: 3
  },
  predict: {
    prompt: "If you double the net force on the same mass, what happens to acceleration?",
    revealHtml: "Making a prediction first improves later recall. You will verify this in the Experiment stage."
  },
  hook: { prompt: "You push an empty shopping cart and a full one with the same force. Which accelerates more, and why? Note your first idea." },
  evidence: {
    prompt: "Which explanation best fits a cart that accelerates more when pushed harder (same mass)?",
    options: ["Acceleration is proportional to net force.", "Acceleration depends only on mass.", "Force and acceleration are unrelated.", "Heavier objects always accelerate faster."],
    answer: 0, why: "F = m x a: with mass fixed, acceleration is proportional to net force."
  },
  challenge: {
    prompt: "A 5 kg object experiences a net force of 20 N. Calculate its acceleration and explain your steps.",
    keywords: [{ re: /4/, msg: "the value 4" }, { re: /f\s*\/\s*m|f\s*=\s*ma|divide|\/\s*5|20\s*\/\s*5/, msg: "using a = F/m" }, { re: /newton|\bn\b|kg|m\/s/, msg: "units" }],
    minCorrect: 2, why: "a = F/m = 20/5 = 4 m/s2."
  },
  game: {
    title: "Mission control", unit: "m/s2", kind: "physics", target: 3,
    goal: "Adjust force, mass and friction so the object reaches the target acceleration. Notice how mass and friction resist motion.",
    sliders: [{ id: "force", label: "Force (N)" }, { id: "mass", label: "Mass (kg)" }, { id: "friction", label: "Friction (N)" }]
  },
  quiz: [
    { q: "What is the equation for Newton's second law?", opts: ["F = m + a", "F = m x a", "F = m / a", "F = a / m"], a: 1, why: "Net force equals mass times acceleration." },
    { q: "A 2 kg object has a net force of 10 N. Its acceleration is:", opts: ["2 m/s2", "5 m/s2", "20 m/s2", "12 m/s2"], a: 1, why: "a = F/m = 10/2 = 5 m/s2." },
    { q: "If mass increases and force stays the same, acceleration:", opts: ["Increases", "Decreases", "Stays the same", "Becomes zero"], a: 1, why: "a = F/m, so larger mass means smaller acceleration." },
    { q: "The net force on an object moving at constant velocity is:", opts: ["Positive", "Negative", "Zero", "Equal to its weight"], a: 2, why: "Constant velocity means zero acceleration, so net force is zero." }
  ],
  misconceptions: [
    { wrong: "A moving object always has a net force on it.", right: "Constant velocity means zero net force; a net force only exists when velocity is changing." },
    { wrong: "Heavier objects fall faster because gravity pulls harder.", right: "Mass and gravitational force scale together, so acceleration due to gravity is the same." }
  ]
},
{
  id: "supply-demand",
  title: "Supply and Demand",
  image: "/src/assets/images/topic_sunset_market_1795446683489.jpg",
  art: "supply-demand",
  summary: "Prices adjust until quantity supplied equals quantity demanded: the market equilibrium.",
  classification: "quant, concept, relation",
  concepts: [
    { id: "demand", name: "Demand", def: "Quantity buyers want at each price; usually falls as price rises.", kind: "concept" },
    { id: "supply", name: "Supply", def: "Quantity sellers offer at each price; usually rises as price rises.", kind: "concept" },
    { id: "price", name: "Price", def: "The amount paid per unit; the signal that coordinates buyers and sellers.", kind: "variable" },
    { id: "equilibrium", name: "Equilibrium", def: "The price where quantity supplied equals quantity demanded.", kind: "concept" },
    { id: "surplus", name: "Surplus", def: "Excess supply: quantity supplied exceeds quantity demanded at a given price.", kind: "outcome" },
    { id: "shortage", name: "Shortage", def: "Excess demand: quantity demanded exceeds quantity supplied at a given price.", kind: "outcome" }
  ],
  relationships: [
    { from: "price", to: "demand", label: "up price, down demand" },
    { from: "price", to: "supply", label: "up price, up supply" },
    { from: "supply", to: "equilibrium", label: "meets demand at" },
    { from: "demand", to: "equilibrium", label: "meets supply at" },
    { from: "surplus", to: "price", label: "pushes price down" },
    { from: "shortage", to: "price", label: "pushes price up" }
  ],
  process: [
    { t: "Draw", d: "Plot demand (downward) and supply (upward) curves." },
    { t: "Equilibrium", d: "Find the price where the curves cross." },
    { t: "Compare", d: "Compare the actual price to the equilibrium price." },
    { t: "Diagnose", d: "Above equilibrium means surplus; below means shortage." },
    { t: "Adjust", d: "Predict how price moves to remove the surplus or shortage." }
  ],
  graph: {
    labels: ["0", "25", "50", "75", "100"],
    series: [
      { name: "Demand", color: "#D9846F", data: [100, 75, 50, 25, 0] },
      { name: "Supply", color: "#7EA85B", data: [0, 25, 50, 75, 100] }
    ],
    xlabel: "Quantity", ylabel: "Price"
  },
  story: {
    title: "The concert ticket market",
    scenes: [
      { t: "Too cheap", d: "Tickets are priced below equilibrium; far more fans want them than there are seats." },
      { t: "Shortage", d: "A shortage appears; tickets sell out instantly and resellers appear." },
      { t: "Price rises", d: "Sellers raise prices; some fans drop out, some seats are still sold." },
      { t: "Too dear", d: "If priced too high, seats go unsold: a surplus." },
      { t: "Equilibrium", d: "At the right price, quantity supplied equals quantity demanded." },
      { t: "Signal", d: "Price is the signal that coordinates buyers and sellers." }
    ]
  },
  diagram: {
    inputs: [{ label: "Price", color: "#F2B44B" }], outputs: [{ label: "Quantity", color: "#558E9B" }],
    center: "Market", centerSub: "supply meets demand"
  },
  worked: [
    { t: "Given", d: "Demand: Qd = 100 - P. Supply: Qs = P." },
    { t: "Equilibrium", d: "Set Qd = Qs: 100 - P = P." },
    { t: "Solve", d: "100 = 2P, so P = 50." },
    { t: "Quantity", d: "Q = 50 at the equilibrium price." },
    { t: "Interpret", d: "At price 50, buyers and sellers agree on quantity 50." }
  ],
  guide: [
    { q: "When price rises, quantity demanded usually ______.", a: "falls", hint: "Think about willingness to pay." },
    { q: "The price where supply equals demand is called ______.", a: "equilibrium", hint: "A balance point." },
    { q: "Excess supply is called a ______.", a: "surplus", hint: "Opposite of shortage." }
  ],
  hint: {
    question: "At a price below equilibrium, is there a surplus or a shortage?",
    hints: ["Below equilibrium, price is low.", "Low price means high quantity demanded and low quantity supplied.", "Demand exceeds supply, so there is a shortage."],
    keywords: [{ re: /shortage/, msg: "shortage" }, { re: /demand.*supply|exceed|more|greater/, msg: "demand exceeding supply" }],
    answerHtml: "Correct: below equilibrium, quantity demanded exceeds quantity supplied, creating a shortage that pushes price up."
  },
  explain: {
    prompt: "Explain how price adjusts to reach equilibrium in a market.",
    keywords: [{ re: /supply/, msg: "supply" }, { re: /demand/, msg: "demand" }, { re: /price/, msg: "price" }, { re: /equilibri/, msg: "equilibrium" }, { re: /surplus|shortage/, msg: "surplus/shortage" }],
    minCorrect: 3
  },
  predict: {
    prompt: "If the price of coffee rises, what happens to the quantity of coffee buyers want to buy?",
    revealHtml: "Making a prediction first improves recall. You will verify with the market simulation."
  },
  hook: { prompt: "Why do concert tickets for a hugely popular show cost so much, while unpopular events give tickets away? Note your first idea." },
  evidence: {
    prompt: "A price is set below equilibrium. Which explanation best fits what happens next?",
    options: ["A shortage appears and price tends to rise.", "A surplus appears and price tends to fall.", "Nothing changes; the price stays fixed.", "Demand falls to meet supply."],
    answer: 0, why: "Below equilibrium, demand exceeds supply, so shortage pushes price up."
  },
  challenge: {
    prompt: "Demand is Qd = 100 - P and supply is Qs = P. Find the equilibrium price and quantity, and explain.",
    keywords: [{ re: /50/, msg: "the value 50" }, { re: /equal|equilibri|qd\s*=\s*qs|set.*equal/, msg: "setting Qd = Qs" }, { re: /price|quantity/, msg: "price and quantity" }],
    minCorrect: 2, why: "Set 100 - P = P, so P = 50 and Q = 50."
  },
  game: {
    title: "Market maker", unit: "equilibrium price", kind: "market", target: 50,
    goal: "Set the price to balance supply and demand. Too high leaves a surplus; too low causes a shortage.",
    sliders: [{ id: "price", label: "Price" }, { id: "supply", label: "Supply" }, { id: "demand", label: "Demand" }]
  },
  quiz: [
    { q: "What happens to quantity demanded when price rises?", opts: ["It rises", "It falls", "It stays the same", "It becomes zero"], a: 1, why: "Demand curves slope downward: higher price, lower quantity demanded." },
    { q: "Market equilibrium occurs where:", opts: ["Supply is zero", "Demand is highest", "Quantity supplied equals quantity demanded", "Price is highest"], a: 2, why: "Equilibrium is where the supply and demand curves intersect." },
    { q: "A surplus (excess supply) puts what pressure on price?", opts: ["Upward", "Downward", "None", "It doubles price"], a: 1, why: "Unsold goods push sellers to lower prices." },
    { q: "A shortage (excess demand) tends to make price:", opts: ["Fall", "Rise", "Stay fixed", "Become zero"], a: 1, why: "Competition among buyers pushes price up." }
  ],
  misconceptions: [
    { wrong: "Higher prices always mean sellers make more money.", right: "Higher prices reduce quantity demanded; total revenue depends on elasticity." },
    { wrong: "Equilibrium means the market is fair.", right: "Equilibrium is simply where quantity supplied equals quantity demanded; fairness is a separate judgement." }
  ]
}
];

var ARCHETYPES = {
  builder: { name: "Builder", glyph: "🔧", mode: "Interactive challenge", color: ["#D9846F", "#F2B44B"], blurb: "Learns by doing.",
    journeys: [
      { stage: "Mission", view: "challenge", instr: "Present a practical problem related to the topic." },
      { stage: "Predict", view: "predict", instr: "Ask the learner what they think will happen." },
      { stage: "Demonstrate", view: "worked", instr: "Show a worked example or simulation." },
      { stage: "Experiment", view: "game", instr: "Let the learner change variables or try a solution." },
      { stage: "Transfer", view: "challenge", instr: "Give a different problem requiring the same concept." },
      { stage: "Explain", view: "explain", instr: "Ask why their solution worked." } ] },
  architect: { name: "Architect", glyph: "🏛️", mode: "Knowledge maps", color: ["#558E9B", "#7EA85B"], blurb: "Wants the whole system.",
    journeys: [
      { stage: "Overview", view: "diagram", instr: "Introduce the topic and its main components." },
      { stage: "Map", view: "conceptmap", instr: "Show how concepts connect and depend on one another." },
      { stage: "Zoom", view: "concepts", instr: "Let the learner open each branch." },
      { stage: "Connect", view: "explain", instr: "Link newly learned concepts to existing ones." },
      { stage: "Reconstruct", view: "reconstruct", instr: "Hide the map and rebuild it from memory." },
      { stage: "Apply", view: "quiz", instr: "Test whether the system works as a whole." } ] },
  sprinter: { name: "Sprinter", glyph: "⚡", mode: "Micro-learning & retrieval", color: ["#7EA85B", "#558E9B"], blurb: "Short, focused rounds.",
    journeys: [
      { stage: "Quick start", view: "summary", instr: "Give a short summary of the topic." },
      { stage: "Learn", view: "diagram", instr: "Explain one small concept at a time." },
      { stage: "Check", view: "quiz", instr: "Ask a quick question immediately after the explanation." },
      { stage: "Feedback", view: "explain", instr: "Explain why the answer is right or wrong." },
      { stage: "Repeat", view: "retrieve", instr: "Bring the concept back in a later session." },
      { stage: "Challenge", view: "quiz", instr: "Mix older and newer concepts in a short quiz." } ] },
  explorer: { name: "Explorer", glyph: "🧭", mode: "Inquiry & Socratic dialogue", color: ["#8C6A4A", "#558E9B"], blurb: "Curiosity-led.",
    journeys: [
      { stage: "Curiosity hook", view: "hook", instr: "Begin with an intriguing question or contradiction." },
      { stage: "Hypothesise", view: "predict", instr: "Ask what the learner thinks might explain it." },
      { stage: "Investigate", view: "evidence", instr: "Provide evidence, concepts and competing explanations." },
      { stage: "Challenge", view: "hook", instr: "Introduce an edge case or alternative interpretation." },
      { stage: "Resolve", view: "explain", instr: "Explain the underlying principle and correct misconceptions." },
      { stage: "Extend", view: "quiz", instr: "Ask a new question that uses the same principle." } ] },
  strategist: { name: "Strategist", glyph: "🎯", mode: "Goal & mastery planning", color: ["#F2B44B", "#D9846F"], blurb: "Goal-oriented.",
    journeys: [
      { stage: "Target", view: "goal", instr: "Identify the exam, deadline or learning objective." },
      { stage: "Diagnose", view: "diagnose", instr: "Test existing knowledge and confidence." },
      { stage: "Prioritise", view: "mastery", instr: "Identify important concepts and knowledge gaps." },
      { stage: "Plan", view: "plan", instr: "Build a realistic sequence of learning activities." },
      { stage: "Practice", view: "quiz", instr: "Give targeted problems and exam-style questions." },
      { stage: "Review", view: "mastery", instr: "Analyse errors and update the next study plan." } ] },
  deep_diver: { name: "Deep Diver", glyph: "🔬", mode: "Explanation & elaboration", color: ["#558E9B", "#8C6A4A"], blurb: "Underlying reasoning.",
    journeys: [
      { stage: "Foundation", view: "summary", instr: "Define the key concepts and terminology." },
      { stage: "Explain", view: "diagram", instr: "Unpack how and why the concept works." },
      { stage: "Derive", view: "conceptmap", instr: "Show the reasoning and mechanism behind it." },
      { stage: "Connect", view: "concepts", instr: "Link it to related theories and concepts." },
      { stage: "Explain back", view: "explain", instr: "Teach the concept in your own words." },
      { stage: "Transfer", view: "quiz", instr: "Introduce a complex problem requiring independent reasoning." } ] },
  repeater: { name: "Repeater", glyph: "🔁", mode: "Spaced retrieval", color: ["#7EA85B", "#F2B44B"], blurb: "Repeated recall.",
    journeys: [
      { stage: "Introduce", view: "diagram", instr: "Explain the concept clearly." },
      { stage: "Recall", view: "retrieve", instr: "Retrieve it without looking." },
      { stage: "Correct", view: "explain", instr: "Show the correct answer and explain mistakes." },
      { stage: "Revisit", view: "retrieve", instr: "Schedule another retrieval attempt." },
      { stage: "Mix", view: "quiz", instr: "Combine related concepts in a mixed practice session." },
      { stage: "Apply", view: "challenge", instr: "Use the knowledge in a new context." } ] },
  guided_learner: { name: "Guided Learner", glyph: "🧑‍🏫", mode: "Scaffolding & worked examples", color: ["#C97A2B", "#F2B44B"], blurb: "Gradually reduced support.",
    journeys: [
      { stage: "Explain", view: "summary", instr: "Introduce one concept in simple language." },
      { stage: "Demonstrate", view: "worked", instr: "Show a complete worked example." },
      { stage: "Guide", view: "guide", instr: "Complete part of the example with support." },
      { stage: "Hint", view: "hint", instr: "Offer support if the learner gets stuck." },
      { stage: "Release", view: "challenge", instr: "Solve a similar problem independently." },
      { stage: "Transfer", view: "quiz", instr: "Introduce a new problem with less guidance." } ] }
};

var REPRESENTATION_RULES = [
  { test: function (c) { return c.indexOf("structure") > -1; }, rep: "diagram", label: "Labelled visual diagram" },
  { test: function (c) { return c.indexOf("relation") > -1 || c.indexOf("concept") > -1; }, rep: "conceptmap", label: "Concept map / knowledge graph" },
  { test: function (c) { return c.indexOf("sequence") > -1 || c.indexOf("event") > -1; }, rep: "story", label: "Timeline / narrative" },
  { test: function (c) { return c.indexOf("process") > -1; }, rep: "conceptmap", label: "Flowchart / process animation" },
  { test: function (c) { return c.indexOf("quant") > -1 || c.indexOf("numeric") > -1; }, rep: "graph", label: "Graph / interactive simulation" },
  { test: function (c) { return c.indexOf("procedure") > -1; }, rep: "worked", label: "Worked example with progressive steps" },
  { test: function (c) { return c.indexOf("decision") > -1; }, rep: "game", label: "Scenario / branching simulation" },
  { test: function (c) { return c.indexOf("fact") > -1 || c.indexOf("term") > -1; }, rep: "retrieve", label: "Flashcards and retrieval questions" }
];