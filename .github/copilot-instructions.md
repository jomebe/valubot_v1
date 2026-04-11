# Frontend Development Guidelines

> These guidelines help create frontend code that is **easy to change** by following four key criteria: Readability, Predictability, Cohesion, and Coupling.

## Core Philosophy

**Easy-to-change code** means:
- New requirements can be implemented by modifying existing code smoothly
- Code intent and behavior are clear and understandable
- The scope of impact from changes is predictable

### Core Principles
1. Readability - Code should be easy to understand
2. Predictability - Consistent patterns and behaviors  
3. Cohesion - Code that changes together stays together
4. Coupling - Minimize dependencies between modules

## 1. Readability

Code that is easy to understand at first glance. Readable code minimizes cognitive context and flows naturally from top to bottom.

### 1.1 Reduce Context

#### Separate Code That Doesn't Execute Together

```javascript
// ❌ Bad: Mixed conditional logic
function SubmitButton() {
  const isViewer = useRole() === "viewer";
  
  useEffect(() => {
    if (!isViewer) {
      showButtonAnimation();
    }
  }, [isViewer]);
  
  return isViewer ? 
    <TextButton disabled>Submit</TextButton> : 
    <Button type="submit">Submit</Button>;
}

// ✅ Good: Separated by role
function SubmitButton() {
  const isViewer = useRole() === "viewer";
  return isViewer ? <ViewerSubmitButton /> : <AdminSubmitButton />;
}

function ViewerSubmitButton() {
  return <TextButton disabled>Submit</TextButton>;
}

function AdminSubmitButton() {
  useEffect(() => {
    showButtonAnimation();
  }, []);
  return <Button type="submit">Submit</Button>;
}
```

#### Abstract Implementation Details

```javascript
// ❌ Bad: Low-level details exposed
async function LoginStartPage() {
  const handleLogin = async () => {
    const response = await fetch('/api/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    if (response.ok) {
      localStorage.setItem('token', response.token);
      window.location.href = '/dashboard';
    }
  };
}

// ✅ Good: Abstracted implementation
async function LoginStartPage() {
  const handleLogin = async () => {
    const success = await attemptLogin(username, password);
    if (success) {
      navigateToDashboard();
    }
  };
}
```

#### Split Functions by Logic Type

```javascript
// ❌ Bad: Mixed logic types
function usePageState() {
  // Data fetching logic
  const fetchData = async () => { ... };
  
  // UI state management
  const toggleModal = () => { ... };
  
  // Form validation
  const validateForm = () => { ... };
  
  return { fetchData, toggleModal, validateForm };
}

// ✅ Good: Separated by concern
function usePageData() {
  const fetchData = async () => { ... };
  return { fetchData };
}

function usePageUI() {
  const toggleModal = () => { ... };
  return { toggleModal };
}

function usePageForm() {
  const validateForm = () => { ... };
  return { validateForm };
}
```

### 1.2 Naming

#### Name Complex Conditions

```javascript
// ❌ Bad: Unclear condition
const result = products.filter(product =>
  product.categories.some(category =>
    category.id === targetCategory.id &&
    product.prices.some(price => price >= minPrice && price <= maxPrice)
  )
);

// ✅ Good: Named conditions
const matchedProducts = products.filter(product => {
  return product.categories.some(category => {
    const isSameCategory = category.id === targetCategory.id;
    const isPriceInRange = product.prices.some(
      price => price >= minPrice && price <= maxPrice
    );
    return isSameCategory && isPriceInRange;
  });
});
```

#### Name Magic Numbers

```javascript
// ❌ Bad: Unclear number meaning
async function onLikeClick() {
  await postLike(url);
  await delay(300);
  await refetchPostLike();
}

// ✅ Good: Named constant
const ANIMATION_DELAY_MS = 300;

async function onLikeClick() {
  await postLike(url);
  await delay(ANIMATION_DELAY_MS);
  await refetchPostLike();
}
```

### 1.3 Top-to-Bottom Flow

#### Reduce Timeline Shifts

```javascript
// ❌ Bad: Jumping between different times
function UserPolicy() {
  const policy = fetchPolicy(); // Future: async
  
  if (!user) return null; // Present: check
  
  useEffect(() => { // Future: effect
    trackView();
  }, []);
  
  return <div>{policy?.content}</div>; // Present: render
}

// ✅ Good: Consistent timeline
function UserPolicy() {
  // All present checks first
  if (!user) return null;
  
  // All data fetching
  const policy = fetchPolicy();
  
  // All effects
  useEffect(() => {
    trackView();
  }, []);
  
  // Final render
  return <div>{policy?.content}</div>;
}
```

#### Simplify Ternary Operators

```javascript
// ❌ Bad: Complex nested ternary
const message = isLoading ? "Loading..." : 
  hasError ? "Error occurred" : 
  data ? `Found ${data.length} items` : 
  "No data";

// ✅ Good: Clear conditions
function getMessage() {
  if (isLoading) return "Loading...";
  if (hasError) return "Error occurred";
  if (data) return `Found ${data.length} items`;
  return "No data";
}

const message = getMessage();
```

## 2. Predictability

Code should behave as expected based on function names, parameters, and return types.

### 2.1 Avoid Name Collisions

```javascript
// ❌ Bad: Confusing names
import { Button } from './components/Button';
import { Button as BaseButton } from 'library';

// ✅ Good: Clear distinctions
import { AppButton } from './components/AppButton';
import { Button } from 'library';
```

### 2.2 Unify Return Types for Similar Functions

```javascript
// ❌ Bad: Inconsistent returns
function useUser() {
  const query = useQuery({ queryKey: ["user"], queryFn: fetchUser });
  return query; // Returns query object
}

function useServerTime() {
  const query = useQuery({ queryKey: ["serverTime"], queryFn: fetchServerTime });
  return query.data; // Returns only data!
}

// ✅ Good: Consistent pattern
function useUser() {
  const query = useQuery({ queryKey: ["user"], queryFn: fetchUser });
  return query;
}

function useServerTime() {
  const query = useQuery({ queryKey: ["serverTime"], queryFn: fetchServerTime });
  return query; // Same return pattern
}
```

### 2.3 Reveal Hidden Logic

```javascript
// ❌ Bad: Hidden side effect
async function fetchBalance() {
  const balance = await http.get("/balance");
  logging.log("balance_fetched"); // Hidden!
  return balance;
}

// ✅ Good: Explicit behavior
async function fetchBalance() {
  const balance = await http.get("/balance");
  return balance;
}

// At usage site
const balance = await fetchBalance();
logging.log("balance_fetched"); // Visible at call site
```

## 3. Cohesion

Code that changes together should live together.

### 3.1 Colocate Files That Change Together

```
// ❌ Bad: Organized by file type
src/
├── components/
├── hooks/
├── utils/
└── constants/

// ✅ Good: Organized by domain/feature
src/
├── shared/           # Used across features
│   ├── components/
│   └── hooks/
└── features/
    ├── auth/         # All auth-related code
    │   ├── components/
    │   ├── hooks/
    │   └── utils/
    └── products/     # All product-related code
        ├── components/
        ├── hooks/
        └── utils/
```

### 3.2 Remove Magic Numbers

```javascript
// ❌ Bad: Same value in multiple places
// In animation.js
fadeIn(300);

// In transition.js  
slideOut(300);

// In delay.js
wait(300);

// ✅ Good: Single source of truth
// In constants.js
export const ANIMATION_DURATION_MS = 300;

// In all files
import { ANIMATION_DURATION_MS } from './constants';
fadeIn(ANIMATION_DURATION_MS);
slideOut(ANIMATION_DURATION_MS);
wait(ANIMATION_DURATION_MS);
```

### 3.3 Form Cohesion

#### Field-Level Cohesion (Independent Fields)
Use when fields have independent validation and can be reused separately.

```javascript
// Each field manages its own state and validation
function EmailField({ value, onChange, error }) {
  const validate = (email) => {
    if (!email) return "Email required";
    if (!email.includes('@')) return "Invalid email";
    return "";
  };
  
  return (
    <input 
      value={value}
      onChange={(e) => onChange(e.target.value, validate(e.target.value))}
    />
  );
}
```

#### Form-Level Cohesion (Interdependent Fields)
Use when fields depend on each other or share validation logic.

```javascript
// Centralized form management
function useFormValidation(values) {
  const errors = {};
  
  if (values.password !== values.confirmPassword) {
    errors.confirmPassword = "Passwords must match";
  }
  
  if (values.endDate < values.startDate) {
    errors.endDate = "End date must be after start date";
  }
  
  return errors;
}
```

## 4. Coupling

Minimize dependencies between modules to reduce change impact.

### 4.1 Single Responsibility

```javascript
// ❌ Bad: Multiple responsibilities
function usePageState() {
  // User management
  const [user, setUser] = useState();
  const fetchUser = () => { ... };
  
  // Posts management  
  const [posts, setPosts] = useState();
  const fetchPosts = () => { ... };
  
  // UI state
  const [isModalOpen, setIsModalOpen] = useState();
  
  return { user, posts, isModalOpen, ... };
}

// ✅ Good: Separated concerns
function useUser() {
  const [user, setUser] = useState();
  const fetchUser = () => { ... };
  return { user, fetchUser };
}

function usePosts() {
  const [posts, setPosts] = useState();
  const fetchPosts = () => { ... };
  return { posts, fetchPosts };
}

function useModal() {
  const [isOpen, setIsOpen] = useState(false);
  return { isOpen, setIsOpen };
}
```

### 4.2 Allow Code Duplication (When Appropriate)

```javascript
// ❌ Bad: Forced abstraction creating coupling
function useBottomSheet(type) {
  // Complex shared logic trying to handle all cases
  if (type === 'product') { ... }
  else if (type === 'user') { ... }
  else if (type === 'order') { ... }
}

// ✅ Good: Independent implementations
function useProductSheet() {
  // Product-specific logic
}

function useUserSheet() {
  // User-specific logic
}

// Some duplication is better than wrong abstraction
```

### 4.3 Eliminate Props Drilling

#### Using Composition

```javascript
// ❌ Bad: Props drilling
function ItemEditModal({ items, recommendedItems, onConfirm }) {
  return (
    <Modal>
      <ItemEditBody 
        items={items}
        recommendedItems={recommendedItems}
        onConfirm={onConfirm}
      />
    </Modal>
  );
}

// ✅ Good: Composition pattern
function ItemEditModal({ onConfirm }) {
  return (
    <Modal>
      <ItemEditBody>
        <ItemEditList onConfirm={onConfirm} />
      </ItemEditBody>
    </Modal>
  );
}
```

#### Using Context (For Deep Hierarchies)

```javascript
// Only when composition isn't enough
const ItemContext = createContext();

function ItemProvider({ children, items }) {
  return (
    <ItemContext.Provider value={items}>
      {children}
    </ItemContext.Provider>
  );
}

function DeepChildComponent() {
  const items = useContext(ItemContext);
  // Can access items without props drilling
}
```

## Code Review Checklist

When reviewing or writing code, verify:

### Readability
- [ ] Functions have single, clear purposes
- [ ] Complex conditions have descriptive names  
- [ ] Magic numbers are replaced with named constants
- [ ] Code flows logically from top to bottom
- [ ] Implementation details are properly abstracted

### Predictability  
- [ ] Similar functions have consistent return types
- [ ] Hidden side effects are made explicit
- [ ] Names clearly indicate function behavior
- [ ] No surprising behaviors in functions

### Cohesion
- [ ] Related files are in the same directory
- [ ] Shared constants are defined once
- [ ] Form validation matches form structure
- [ ] Changes require modifying files in one place

### Coupling
- [ ] Components have single responsibilities
- [ ] Props drilling doesn't exceed 2-3 levels
- [ ] Duplication is allowed when it reduces coupling
- [ ] Dependencies between modules are minimized

## Implementation Guidelines

### For AI Code Generation
When generating frontend code:
1. **Start with the simplest solution** that meets requirements
2. **Extract abstractions only when** patterns repeat 3+ times
3. **Prefer composition over** complex prop passing
4. **Keep functions small** - under 50 lines ideally
5. **Name things based on what they do**, not how they do it

### Progressive Enhancement
1. **Phase 1**: Write working code that solves the problem
2. **Phase 2**: Apply readability improvements 
3. **Phase 3**: Extract common patterns if found
4. **Phase 4**: Optimize performance if needed

### TypeScript Usage (When Applicable)
```typescript
// Use type inference where possible
const [count, setCount] = useState(0); // Type inferred

// Be explicit for function parameters
function calculate(a: number, b: number): number {
  return a + b;
}

// Use unions for finite states
type Status = 'idle' | 'loading' | 'success' | 'error';
```

## Trade-offs

Remember these principles can conflict:

- **Readability vs. Cohesion**: Sometimes duplication is clearer than abstraction
- **Predictability vs. Flexibility**: Consistent patterns may limit flexibility
- **Cohesion vs. Coupling**: Grouping code together can increase dependencies

**Decision Framework:**
1. What changes together? → Increase cohesion
2. What changes separately? → Reduce coupling  
3. Who will maintain this? → Prioritize readability
4. How often will this change? → Consider all factors

## Refactoring Signals

Consider refactoring when:
- A file exceeds 200 lines
- A function exceeds 50 lines
- Props are passed through 3+ components unchanged
- The same code appears in 3+ places
- A component has 3+ separate responsibilities
- Nested conditionals exceed 3 levels deep

---