### CHAPTER 2: LITERATURE REVIEW

The evolution of digital photography and digital content creation has increased the demand for accessible, powerful image manipulation tools. Traditionally, professional image editing has been dominated by heavy, desktop-bound applications that require significant computational resources, complex installations, and steep learning curves [1]. Historically, performing complex graphical transformations required robust local hardware. However, this paradigm has shifted toward remote, browser-based editing solutions. Modern platforms now leverage continuous real-time data synchronization through reactive "backend-as-a-service" architectures to seamlessly manage complex project states without relying on traditional, slow server routing [2].

Modern web technologies have fundamentally enabled this transition on the client side. The introduction of the HTML5 Canvas API created a standard for rendering highly interactive 2D graphics directly in the browser [3]. To maneuver around the graphical complexity of the native Canvas SDK, object models like Fabric.js have been widely adopted to flexibly manage interactive layers, complex bounding boxes, and geometric object manipulation within web applications [4]. This abstraction empowers developers to mimic the complex interactive behavior of desktop applications entirely within the browser window.

Concurrently, artificial intelligence has revolutionized traditional image editing workflows. Upadhye [5] states that AI interventions—such as intelligent background removal and generative fill—have significantly reduced the manual effort required for complex visual edits. Furthermore, Li et al. [6] highlight the massive leap in dynamic "inpainting" and "outpainting" capabilities driven by generative diffusion models. However, executing these computationally heavy models locally poses severe hardware scalability and security constraints, prompting a necessary industry pivot towards secure, cloud-based AI execution pipelines [7].

Architecturally, building a responsive single-page application (SPA) capable of seamlessly handling real-time graphics and cloud integrations requires robust frontend frameworks like Next.js [8]. Such full-stack frameworks, when deployed efficiently, optimize client-side rendering performance and state management securely, ensuring that interaction latency remains virtually non-existent despite heavy graphical demands [9]. 

Despite the availability of discrete tools and libraries, many existing industry platforms either force users into expensive desktop software ecosystems to access advanced AI tools or provide free web editors entirely lacking sophisticated generative AI capabilities. Based on the reviewed literature, there is a clear necessity for a unified, modern solution. The proposed Easy Edit application addresses these gaps by combining interactive HTML5 object manipulation, serverless continuous synchronization, and cloud-distributed Generative AI operations into a single, highly accessible browser-based platform.

***

### REFERENCES

[1] Adobe, "Professional Image Manipulation Standards," *Adobe Whitepapers*, 2023. 
[2] Convex Inc., "Convex Documentation: Full-stack Reactive Backend-as-a-Service," 2024.
[3] S. Fulton and J. Fulton, *HTML5 Canvas: Native Interactivity and Animation for the Web*, Sebastopol: O'Reilly Media, 2013. 
[4] Fabric.js, "Canvas Interaction Documentation," 2024.
[5] S. Upadhye, "AI in Image Editing and Enhancement: Revolutionizing Photography," *Int. Journal of Modern Engineering & Management Research*, 2024.
[6] M. Li, et al., "Generative AI in Image Processing: A Review of Diffusion Models and Inpainting Techniques," *IEEE Access*, vol. 11, pp. 45100-45115, 2023.
[7] IEEE, "Client-side vs Server-side AI: A security perspective," 2023. 
[8] Vercel, "Next.js Documentation: The React Framework for the Web," 2024.
[9] J. Huang, "Performance Optimization of React-based Single Page Applications," *Journal of Web Engineering*, vol. 19, pp. 25-38, 2021.
