namespace U.Stdlib.Patterns {
    open Microsoft.Quantum.Intrinsic;
    open Microsoft.Quantum.Canon;
    open Microsoft.Quantum.Convert;
    open Microsoft.Quantum.Arrays;
    open Microsoft.Quantum.Core;

    /// # Summary
    /// Defines the signature for an operation that handles quantum state updates.
    /// It receives the measurement result and a context message.
    newtype ObserverCallback = ((Result, String) => Unit);

    /// # Summary
    /// Represents an observer entity capable of reacting to quantum events.
    newtype QuantumObserver = (
        Id : Int,
        Name : String,
        OnNotify : ObserverCallback
    );

    /// # Summary
    /// Represents the subject in the observer pattern. 
    /// It maintains an immutable registry of observers.
    newtype QuantumSubject = (
        Observers : QuantumObserver[]
    );

    /// # Summary
    /// Initializes a new QuantumSubject with no observers.
    function CreateSubject() : QuantumSubject {
        return QuantumSubject([]);
    }

    /// # Summary
    /// Creates a new QuantumObserver instance.
    function CreateObserver(id : Int, name : String, callback : ObserverCallback) : QuantumObserver {
        return QuantumObserver(id, name, callback);
    }

    /// # Summary
    /// Adds an observer to the subject. 
    /// Returns a new QuantumSubject instance containing the updated list.
    function Subscribe(subject : QuantumSubject, observer : QuantumObserver) : QuantumSubject {
        return QuantumSubject(subject::Observers + [observer]);
    }

    /// # Summary
    /// Removes an observer from the subject based on the observer's ID.
    /// Returns a new QuantumSubject instance.
    function Unsubscribe(subject : QuantumSubject, observerId : Int) : QuantumSubject {
        mutable updatedList = [];
        for obs in subject::Observers {
            if (obs::Id != observerId) {
                set updatedList += [obs];
            }
        }
        return QuantumSubject(updatedList);
    }

    /// # Summary
    /// Triggers the notification logic for all registered observers.
    /// This is typically called after a significant quantum operation (like measurement).
    operation NotifyObservers(subject : QuantumSubject, result : Result, message : String) : Unit {
        for observer in subject::Observers {
            let callback = observer::OnNotify;
            callback(result, message);
        }
    }

    /// # Summary
    /// A composite operation that measures a qubit and immediately notifies all observers
    /// of the result. This ensures the classical side effects of the quantum state collapse
    /// are propagated to the .u runtime environment.
    operation MeasureAndNotify(subject : QuantumSubject, target : Qubit, label : String) : Result {
        // Perform the measurement
        let result = M(target);
        
        // Notify all listeners of the collapse
        NotifyObservers(subject, result, label);
        
        return result;
    }

    /// # Summary
    /// Resets a qubit and notifies observers if the qubit was in the One state prior to reset.
    operation ResetAndNotify(subject : QuantumSubject, target : Qubit) : Unit {
        let result = M(target);
        if (result == One) {
            X(target); // Flip back to Zero
            NotifyObservers(subject, One, "Qubit Reset from Excited State");
        } else {
            NotifyObservers(subject, Zero, "Qubit Reset from Ground State");
        }
    }
}