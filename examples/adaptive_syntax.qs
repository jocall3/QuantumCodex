// adaptive_syntax.qs
//
// This script demonstrates the "Adaptive Evolution of Syntax" feature of Q-Script.
// It uses a custom, domain-specific syntax defined in 'tasks.qss' to manage a simple to-do list.
// The custom syntax makes the code more readable and intuitive for this specific task,
// transforming the script into a Domain-Specific Language (DSL) for task management.

// The 'using syntax' directive instructs the Q-Script engine to load and apply
// the grammatical rules defined in the specified .qss file for the remainder of this script.
// This allows for the use of natural-language-like commands defined by the user.
using syntax from "tasks.qss";

// --- Script Start ---

// The following commands are not built-in to Q-Script. They are parsed and executed
// according to the rules and mappings defined in 'tasks.qss'.

// 1. Create a new to-do list.
// The phrase 'create a new task list named' is a custom command.
print("Initializing a new task list for 'Project Mercury'...");
create a new task list named "Project Mercury";

// 2. Add several tasks to the list.
// The 'add task ... to ...' structure is another custom command.
print("Adding initial tasks...");
add task "Design core application loop" to "Project Mercury";
add task "Implement terminal rendering engine" to "Project Mercury";
add task "Develop adaptive syntax parser" to "Project Mercury";
add task "Write user documentation" to "Project Mercury";

// 3. Display the current state of the list.
// 'show all tasks in' is a custom command that prints a formatted list.
print("\n--- Current Task List: Project Mercury ---");
show all tasks in "Project Mercury";

// 4. Mark a task as completed.
// The syntax 'mark task ... in ... as completed' is a custom action.
print("\nCompleting the first task...");
mark task "Design core application loop" in "Project Mercury" as completed;
print("Task 'Design core application loop' marked as complete.");

// 5. Show the list again to see the updated status.
print("\n--- Task List After Update ---");
show all tasks in "Project Mercury";

// 6. Use another custom command to filter and show only pending tasks.
// This demonstrates more complex logic being abstracted behind simple syntax.
print("\n--- Remaining Pending Tasks ---");
show pending tasks in "Project Mercury";

// --- Script End ---
print("\nDemonstration of adaptive syntax for task management is complete.");
print("The script was executed using custom grammar rules from 'tasks.qss'.");