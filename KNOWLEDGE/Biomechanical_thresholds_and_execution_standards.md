# Biomechanical thresholds and execution standards for real-time movement analysis

**A real-time barbell movement tracking system requires three layers of data: joint-level injury thresholds drawn from sports medicine research, competition-legal execution standards from IPF and CrossFit rulesets, and a tiered severity classification framework to translate raw angles into actionable alerts.** This report compiles specific degree values, measurement conventions, and risk boundaries for all nine major joints and 20+ barbell movements, organized for direct translation into a programmatic JSON schema. The measurement convention used throughout is **0° = anatomical position** (full extension for limbs, neutral for spine), with increasing values indicating greater flexion, abduction, or deviation.

---

## Joint safety constraints from sports medicine literature

Each joint has evidence-based thresholds where injury risk escalates. The following data is organized by joint with specific degree values, injury mechanisms, and source studies.

### Knee

**Dynamic valgus (frontal plane)** is the strongest single predictor of ACL injury. Hewett et al. (2005) found ACL-injured female athletes demonstrated **8° greater knee abduction** at landing than uninjured controls, with valgus moment predicting injury at 73% sensitivity and 78% specificity. The injury mechanism combines valgus loading with anterior tibial translation and internal rotation. For a real-time system, thresholds should be: **optimal 0–5°**, warning 5–10°, high risk 10–15°, critical >15°. During bilateral loaded squats (lower impact forces than landing), any visible medial knee collapse warrants immediate flagging.

**Hyperextension** beyond 0° at lockout carries risk to the posterior capsule and cruciate ligaments. Fornalski et al. (2008) demonstrated that 15° of hyperextension caused moderate posterolateral damage in cadaveric specimens, while **30° caused partial ACL avulsion**. Normal physiological hyperextension ranges from 0–5° (males) to 0–6° (females). Under barbell load, lockout should target 0° with muscular tension; any hyperextension beyond **5° under load** enters the warning zone.

**Flexion under load** is generally safe through deep ranges. Schoenfeld (2010) confirmed that ACL forces actually decrease beyond 60° of flexion. A 2024 Frontiers scoping review found **87% of studies** (13 of 15) confirmed deep squats do not increase injury risk with proper technique. PCL forces peak at maximum flexion, so individuals with PCL pathology should limit flexion to 50–60°. Patellofemoral compressive forces peak around **130° of knee flexion** (reaching ~8,000 N), relevant for athletes with anterior knee pain.

### Hip

Full-depth squats require approximately **120° of hip flexion**, near the end of normal passive ROM (120–135°). When hip flexion reaches its anatomical limit, the pelvis posteriorly tilts ("butt wink"), transferring load to the lumbar spine. This compensation typically begins at **100–120°** depending on individual bony anatomy — specifically acetabular depth, femoral neck angle, and version. Femoroacetabular impingement (FAI) becomes symptomatic in combined flexion (>90°) + adduction + internal rotation. Athletes with hip internal rotation below **20° at 90° flexion** are at elevated risk. Lateral pelvic shift asymmetry exceeding **10% of ROM** between sides is clinically meaningful.

### Ankle

Normal dorsiflexion ROM is **15–20°** (non-weight-bearing). Parallel squats require 15–25°, while full-depth ATG squats demand **33–35° ± 5.5°** (Hemmerich et al., 2006). Below 15° dorsiflexion, compensatory lumbar flexion can reach **95% of maximum** — a dangerous substitution pattern. Below 10° is classified as severe restriction. For the system, flag any athlete with less than 15° available dorsiflexion as requiring heel elevation.

### Shoulder

Subacromial impingement risk rises sharply above **80° of glenohumeral abduction**, where the supraspinatus tendon is compressed between the humeral head and acromion. A 2024 Frontiers in Physiology musculoskeletal modeling study (Noteboom et al.) tested 45°, 70°, and 90° abduction during bench press, finding that **90° abduction significantly increased glenohumeral superior shear and AC joint loading**. The optimal bench press abduction range is **45–70°**, achievable with grip widths ≤1.5× biacromial width. At 2× biacromial width, abduction exceeds 75°. The combination of >80° abduction + end-range external rotation (the bottom of a wide-grip bench press) maximally stresses the anterior glenohumeral ligament and is the primary mechanism for labral tears and pec major rupture.

### Elbow

Normal full extension is 0° with up to **5–10° of physiological hyperextension** in some individuals. Under barbell load, lockout should target 0°; hyperextension beyond **5° under load** enters warning territory, and beyond **10°** is dangerous due to risk to the anterior capsule, olecranon, and collateral ligaments. The UCL tolerates approximately **30–35 Nm of valgus torque** before failure (Morrey & An, 1983), relevant primarily for overhead pressing and jerks.

### Wrist

Normal extension ROM is 60–75°. Under heavy barbell load, the wrist should remain near neutral with the bar resting over the radius/ulna axis. **Optimal is 0–10° extension**, acceptable up to 20°, warning at 20–35°, and dangerous above 35°. The front-rack position for cleans and front squats demands 70–90° of wrist extension, which is at or beyond normal ROM — this is an inherently stressful position requiring careful monitoring.

### Lumbar spine

McGill's laboratory research establishes that **repeated flexion under compressive load is the primary disc herniation mechanism**. Callaghan & McGill (2001) produced herniations in porcine spines with 22,000–28,000 flexion cycles at low loads, but as few as **5,000–9,500 cycles at higher loads**. Critically, Gallagher et al. (2005) found specimens loaded at maximum flexion survived only **263 cycles versus 8,253 in neutral** — a 30× reduction in tolerance. The flexion-relaxation phenomenon (erector spinae "shutting off" at ~80–90% of max ROM) transfers all load to passive structures. Total lumbar flexion ROM averages **55–65°** (Mawston et al., 2021). Under heavy load, McGill recommends staying within approximately **50% of maximum flexion ROM (~25–30°)**. Even coached lifters maintain 22–26° of lumbar flexion during movements perceived as "neutral" (McGill & Marshall, 2012). The system thresholds should be: optimal <25° from neutral, warning 25–40°, high risk 40–50°, critical >50°. For "butt wink," posterior pelvic tilt exceeding **10–15° with visible lumbar kyphosis** under load should trigger an alert.

### Thoracic spine

Normal standing thoracic kyphosis is **40–45°** (Neumann, 2010), with only 20–25° of available extension. Full overhead lockout requires reducing kyphosis toward 15–20° total (near end-range extension). Excessive kyphosis increase beyond **15° above resting** during loaded squats or deadlifts indicates upper back strength deficit and increases compensatory lumbar and shoulder stress.

### Cervical spine

Neutral position for lifting is a slight chin tuck maintaining natural lordosis, with gaze ~10–15° below horizontal. Deviation beyond **20° from neutral in any plane** under axial barbell load should be flagged. Cervical hyperextension (looking up) under load compresses posterior facet joints and discs; cervical flexion (looking down) stretches posterior ligaments under compressive loading.

---

## Powerlifting execution standards from the 2026 IPF Technical Rulebook

The IPF rulebook (effective March 1, 2026) provides the definitive competition standards for squat, bench press, and deadlift. The following are the exact rules and their biomechanical implications.

### Squat

**Depth requirement:** The lifter must bend the knees and lower the body until **the top surface of the legs at the hip joint is lower than the top of the knees**. This "hip crease below kneecap" standard corresponds to approximately **100–120° of knee flexion** (0° = full extension), though the exact angle varies with anthropometry. The command sequence is "Squat" → "Rack," with the lifter required to be motionless, erect, and knees locked before and after the lift. **Red-light causes include:** insufficient depth (most common), double bouncing or downward movement during ascent, failure to lock knees at completion, stepping or lateral foot movement (rocking ball-to-heel is permitted), and elbow contact with legs that provides support.

Biomechanically optimal stance width is **1.0–1.5× shoulder width** with 15–42° of toe-out (Rippetoe recommends 30–35°). Bar path must remain vertical over midfoot with deviations ideally **≤2–3 cm**. Trunk forward lean ranges from ~15–30° for high-bar to ~30–50° for low-bar, with >55° from vertical excessive for any variation. Hip flexion at the bottom reaches **95–106°** (ETH Zurich/Fry et al.).

### Bench press

**Setup:** Head, shoulders, and buttocks must contact the bench; feet must be flat on the floor. Grip must include **thumbs wrapped around the bar** (no suicide grip), with hand spacing not exceeding **81 cm** between forefingers. The command sequence is "Start" → "Press" → "Rack." The 2026 rules add a critical requirement: **elbows must be lowered so the underside of both elbow joints is level with or below the top of each shoulder joint** before the "Press" command is given — enforcing a minimum descent depth beyond just touching the chest. The bar must be held **motionless on the chest** before pressing. Lockout requires arms fully extended with elbows locked. **Red-light causes include:** heaving/sinking the bar after it is motionless, any downward bar movement during the press, buttocks lifting from bench, feet lifting from floor, uneven lockout, and failure to lower elbows to shoulder level.

Optimal grip width is **1.4–1.5× biacromial width**, producing ~45° shoulder abduction (Green & Comfort, 2007). Grip at 1.65–2.0× biacromial width maximizes strength output (Wagner et al., 1992) but increases shoulder abduction beyond 75°. The bar follows a **slight J-curve** from lower chest back toward the face during the press, with forearms approximately perpendicular to the floor at the bottom.

### Deadlift

**Lockout:** The lifter must stand erect with knees locked straight and shoulders back, specifically with **the front bundle of the deltoid behind the imaginary vertical projection of the bar**. No start command exists — the lifter initiates at will. The "Down" command is given when the bar is held motionless at lockout. **Red-light causes include:** any downward bar movement before final position, failure to lock knees, failure to stand erect with shoulders back, supporting the bar on the thighs (hitching), and stepping. Both sumo and conventional stances are permitted with no stance width restriction.

Conventional deadlift starting position involves a trunk angle of **30–45° from vertical** with hip flexion of ~80–95° and stance width of 32 ± 8 cm (Escamilla et al., 2000). Sumo starts with **15–30° trunk angle from vertical**, hip flexion of ~70–85°, stance width of 70 ± 11 cm, and 42 ± 8° toe-out. Sumo reduces lumbar extensor torque by an estimated **25–35%** and bar travel by 19–25%.

---

## CrossFit competition movement standards

CrossFit does not publish a single universal standards document; standards are released per-workout on official scorecards. The following are compiled from 2018–2026 Games, Open, and Quarterfinal materials.

### Squat-based movements

All squat movements share one universal depth standard: **the hip crease must be clearly below the top of the knee** (below parallel). All require full hip and knee extension at the top. This applies identically to air squats, front squats, overhead squats, and the squat components of thrusters, wall balls, cleans, and snatches.

**Overhead squat** adds the requirement that the bar must reach **full lockout overhead with hips, knees, and arms fully extended** and the bar positioned **over or slightly behind the midline of the body** when viewed from profile. **Thruster** combines the squat depth standard with overhead lockout; critically, a re-dip (converting to a jerk) is a **no-rep** when the standard specifies "thruster." **Wall ball** requires squat depth plus the ball striking the target **clearly above the specified height** (men: 10 ft / women: 9 ft). Missing either the depth or the target height results in a no-rep.

### Barbell strength and Olympic movements

**Deadlift** lockout requires full hip and knee extension with **head and shoulders behind the bar** when viewed from the side. Sumo deadlifts (hands inside knees) are **not permitted** in CrossFit competition — a key difference from IPF rules.

**Clean** standards accept muscle clean, power clean, split clean, or squat clean. The bar must be lifted from the ground to the shoulders in one motion with elbows clearly in front of the bar in the rack position. Full hip and knee extension must be achieved at the top. For a squat clean specifically, the athlete must pass through a squat with hip crease below knee level.

**Jerk** (push jerk or split jerk) requires **full lockout overhead with arms, hips, and knees extended** and feet in line under the body. For split jerk, feet must return to the in-line position before lowering the bar. The bar must be over or behind the midline of the body. **Clean and jerk** follows combined standards, with one critical rule: if any portion receives a no-rep, the **entire rep must be repeated from the floor** — a missed jerk cannot be reattempted from the rack.

**Snatch** must travel from ground to overhead in one motion without stopping at the shoulders. A clean-and-jerk is not permitted. For squat snatch, the athlete must pass through below-parallel depth in a continuous motion — a power snatch followed by a separate overhead squat is explicitly **not allowed**. Lockout requires arms, hips, and knees fully extended with the bar over/behind midline.

**Push press** requires front rack start, leg drive to initiate, and full lockout. A re-dip (converting to a jerk) is a no-rep when push press is specifically called. When the standard says "shoulder-to-overhead," any pressing method is acceptable.

### Gymnastics movements

**Pull-up:** Start from full hang with arms extended, feet off ground. Rep credited when **chin clearly breaks the horizontal plane of the bar**. Kipping and butterfly are permitted unless "strict" is specified.

**Chest-to-bar:** Same start position. Rep credited when **chest makes contact with bar at or below the collarbone**. Contact above the collarbone (neck/throat area) is a no-rep.

**Bar muscle-up:** Must pass through a hang with arms extended. Must pass through a portion of a dip before lockout. **Arms fully locked out** in support above bar. Heels may not rise above bar height during the kip. Pull-overs and glide kips are not permitted.

**Ring muscle-up:** Start from hang with arms extended. Full **elbow lockout** in support with shoulders over or in front of hands. Feet may not rise above the bottom of the rings. A change of direction below the rings is required between consecutive kipping reps.

**Handstand push-up:** At the top: arms locked out, heels touching the wall above a marked target line, hips open. At the bottom: **head contacts the ground/mat**. Hands must stay within a **36-inch wide × 24-inch deep** box on the floor. Kipping is permitted unless "strict" is specified. Deficit HSPU uses elevated hand surfaces (plates/risers) to increase range of motion.

---

## Precise angle data points for JSON schema parameters

The following table provides the specific values needed for each parameter in the movement analysis system, using the convention 0° = anatomical position.

| Parameter | Optimal | Warning | High Risk | Critical | Convention |
|---|---|---|---|---|---|
| **Knee flexion at parallel squat** | 100–120° | — | — | — | 0° = full extension |
| **Knee flexion at full depth** | 135–155° | >155° (if PCL pathology) | — | — | 0° = full extension |
| **Knee valgus (frontal plane)** | 0–5° | 5–10° | 10–15° | >15° | 0° = neutral alignment |
| **Knee hyperextension at lockout** | 0° | 0–5° beyond | 5–10° beyond | >10° beyond | 0° = full extension |
| **Hip flexion — parallel squat** | 95–120° | — | — | — | 0° = standing upright |
| **Hip flexion — full depth squat** | 120–160° | — | — | — | 0° = standing upright |
| **Hip flexion — conventional DL start** | 80–95° | — | — | — | 0° = standing upright |
| **Hip flexion — sumo DL start** | 70–85° | — | — | — | 0° = standing upright |
| **Ankle dorsiflexion for parallel squat** | ≥25° | 15–25° | 10–15° | <10° | 0° = foot 90° to tibia |
| **Ankle dorsiflexion for full depth** | ≥35° | 25–35° | 15–25° | <15° | 0° = foot 90° to tibia |
| **Shoulder abduction — bench press** | 45–70° | 70–80° | 80–85° | >85° | 0° = arm at side |
| **Elbow lockout** | 0° (full extension) | — | 5–10° hyperextension | >10° hyperextension | 0° = full extension |
| **Wrist extension under load** | 0–10° | 10–20° | 20–35° | >35° | 0° = neutral |
| **Lumbar flexion from neutral** | <25° | 25–40° | 40–50° | >50° | 0° = neutral lordosis |
| **Lumbar flexion (% of max ROM)** | <50% | 50–70% | 70–85% | >85% | Max ROM ≈ 55–65° |
| **Trunk forward lean — front squat** | 5–20° | 20–30° | 30–40° | >40° | 0° = vertical |
| **Trunk forward lean — high-bar squat** | 15–35° | 35–45° | 45–55° | >55° | 0° = vertical |
| **Trunk forward lean — low-bar squat** | 30–50° | 50–55° | 55–65° | >65° | 0° = vertical |
| **Bar path deviation from midfoot** | <2 cm | 2–5 cm | 5–8 cm | >8 cm | Horizontal distance |
| **Cervical deviation from neutral** | 0–10° | 10–20° | 20–30° | >30° | Any plane |
| **Thoracic kyphosis increase** | 0–10° above resting | 10–15° above | >15° above | >20° above | Increase from baseline |
| **Posterior pelvic tilt (butt wink)** | <5° | 5–10° | 10–15° with kyphosis | >15° with kyphosis | 0° = starting position |

---

## Severity classification and fatigue detection framework

### Four-tier risk model

No single validated framework currently exists for real-time barbell movement risk assessment — this represents a gap in the literature. The FMS (Functional Movement Screen) is the closest validated system but is designed for pre-participation screening, not real-time loaded assessment. Synthesizing across clinical practice, the FMS 0–3 scale, and sports medicine literature yields a four-tier model:

- **Tier 1 — Optimal (Green):** All joint angles within documented safe ranges. Bar path vertical over midfoot (<2 cm deviation). Spinal neutral maintained (<25° lumbar flexion). No compensatory patterns visible. Corresponds to FMS score 3.
- **Tier 2 — Warning (Yellow):** Minor compensations present — slight knee valgus (5–10°), mild trunk lean increase, minor bar drift (2–5 cm), lumbar flexion 25–40°. Still within physiological safe ranges but trending toward risk. Corresponds to FMS score 2.
- **Tier 3 — High Risk (Orange):** Significant deviation from optimal. Lumbar flexion >40° (>70% max ROM under load). Knee valgus 10–15°. Trunk lean >45° (high-bar). Bar path >5 cm off midfoot. Shoulder abduction >80° on bench. Warrants immediate load reduction or set termination. Corresponds to FMS score 1.
- **Tier 4 — Critical (Red):** Imminent injury risk. Lumbar flexion approaching end-range (>50°). Knee valgus >15°. Visible spinal rounding with kyphosis under heavy load. Any pain. Any sudden positional collapse. Requires immediate cessation. Corresponds to FMS score 0 (pain present).

The FMS composite score of **≤14 (out of 21)** is associated with a roughly **4× increased injury risk** (Kiesel et al., 2007; Chorba et al.), and left-right asymmetries carry a **2.3× risk increase**.

### Fatigue degradation detection

Fatigue produces measurable, progressive form changes that a real-time system can detect through rep-to-rep comparison. The most consistent markers from the literature are **increased trunk forward lean**, increased knee valgus, progressive loss of spinal neutral (increased thoracic and lumbar flexion), decreased depth consistency, and increased bar path deviation. A 2025 Frontiers study confirmed that across repetitions of 3RM deadlifts, spinal flexion and hip extension angles increased significantly from submaximal to maximal loads.

The system should trigger fatigue alerts when any of the following rep-to-rep changes occur relative to the first rep of a set:

- Lumbar flexion increases by **>10–15°**
- Knee valgus increases by **>5°**
- Trunk lean increases by **>10°**
- Bar path horizontal deviation increases by **>2 cm**
- Squat depth varies by **>5° knee flexion** between consecutive reps
- Bar velocity drops **>20–30%** from the first rep (if velocity tracking is available)

Any **sudden positional shift** — a rapid, discontinuous increase in lumbar flexion (a "flexion event") — should trigger an immediate stop signal regardless of magnitude, as this pattern precedes disc injury under load.

---

## Measurement conventions for implementation

All angles in the JSON schema should use the **0° = anatomical position** convention: knee and elbow flexion increase from 0° (fully extended); hip flexion increases from 0° (standing upright); spinal flexion increases from 0° (neutral lordosis/kyphosis); ankle dorsiflexion increases from 0° (foot perpendicular to tibia); shoulder abduction increases from 0° (arm at side); trunk lean increases from 0° (perfectly vertical); knee valgus increases from 0° (neutral frontal plane alignment); wrist extension increases from 0° (neutral). This convention aligns with standard clinical goniometry and most pose-estimation libraries. Where alternative conventions are used in source literature (e.g., 180° = full extension), conversion is straightforward by subtracting from 180°.

The system should ideally calibrate to each individual's baseline ROM during an unloaded assessment before applying population-based thresholds. Individual variation in bony anatomy (particularly hip and thoracic spine structure) can shift "optimal" ranges by 15–20° in either direction. The population thresholds documented here serve as defaults that will be accurate for approximately 80% of the training population.

## Conclusion

Three key insights emerge from this synthesis. First, **injury thresholds are not binary** — they exist on a continuum where risk accumulates through repeated exposure to suboptimal positions (McGill's cycle-dependent disc injury model) rather than single catastrophic events, making real-time rep-by-rep tracking more valuable than single-rep assessment. Second, **competition standards and safety standards do not always align** — IPF squat depth requires hip flexion ranges (100–120°+) that approach the zone where lumbar compensation begins, and the front-rack position demands wrist extension at or beyond normal ROM. The system must distinguish between "competition legal" and "biomechanically optimal." Third, **fatigue detection through rep-to-rep drift may be the highest-value feature**, since form degradation under fatigue is the primary mechanism by which trained lifters sustain injury — not ignorance of proper form. The thresholds compiled here provide a complete, evidence-based foundation for building a four-tier, joint-by-joint, movement-by-movement JSON ruleset that covers both competition compliance and injury prevention.