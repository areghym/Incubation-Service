import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged, signOut } from 'firebase/auth';
import { getFirestore, doc, setDoc, addDoc, onSnapshot, query, updateDoc, deleteDoc, collection } from 'firebase/firestore';
import { Home, LogIn, LogOut, User, Users, FileText, Trash, PlusCircle, AlertTriangle, Loader, X, Edit2 } from 'lucide-react';

// Define global configuration variables (MANDATORY for Canvas environment)
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : null;
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// --- Firebase Initialization and Helpers ---

let app, db, auth;
if (firebaseConfig) {
  try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
    // setLogLevel('Debug'); // Uncomment for verbose logging
  } catch (e) {
    console.error("Firebase initialization failed:", e);
  }
}

// Function to get the correct Firestore reference for private collection
const getPrivateCollectionRef = (userId, collectionName) => {
  if (!db || !userId) return null;
  return collection(db, `artifacts/${appId}/users/${userId}/${collectionName}`);
};

// Function to get the correct Firestore reference for public collection
const getPublicCollectionRef = (collectionName) => {
  if (!db) return null;
  return collection(db, `artifacts/${appId}/public/data/${collectionName}`);
};

// --- Utility Components ---

// Error/Message Modal (replaces alert/confirm)
const MessageModal = ({ message, type, onClose }) => {
    if (!message) return null;

    const baseClasses = "fixed inset-0 flex items-center justify-center p-4 bg-black bg-opacity-50 z-50 transition-opacity duration-300";
    const cardClasses = "bg-white p-6 rounded-xl shadow-2xl max-w-sm w-full transform transition-all duration-300 scale-100";
    
    let icon, color, title;
    switch (type) {
        case 'error':
            icon = <AlertTriangle className="text-red-500" size={24} />;
            color = 'border-red-500';
            title = 'Error';
            break;
        default: // info
            icon = <User className="text-blue-500" size={24} />;
            color = 'border-blue-500';
            title = 'Notification';
    }

    return (
        <div className={baseClasses}>
            <div className={`${cardClasses} border-t-4 ${color}`}>
                <div className="flex items-start justify-between">
                    <div className="flex items-center">
                        {icon}
                        <h3 className="ml-3 text-lg font-semibold text-gray-900">{title}</h3>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition">
                        <X size={20} />
                    </button>
                </div>
                <p className="mt-4 text-sm text-gray-700">{message}</p>
                <div className="mt-6 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- Document Editor Component (Simulated/Placeholder) ---
const DocumentEditor = ({ document, onClose, updateDocument }) => {
    const [title, setTitle] = useState(document.title);
    const [content, setContent] = useState(document.content);
    const [isSaving, setIsSaving] = useState(false);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            // Note: If you want content to persist across sessions, content must be stringified/parsed for complex types
            // but here we assume simple text content, so no JSON.stringify/parse is needed.
            await updateDocument(document.id, { title, content }, document.isPublic);
            // onClose(); // Optionally close after save
        } catch (e) {
            console.error("Save failed:", e);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 flex items-center justify-center p-4 bg-black bg-opacity-70 z-50">
            <div className="bg-white p-8 rounded-xl shadow-2xl max-w-3xl w-full h-5/6 flex flex-col">
                <div className="flex justify-between items-center border-b pb-4 mb-4">
                    <h2 className="text-2xl font-bold text-blue-800">Editing Document</h2>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-800 transition">
                        <X size={24} />
                    </button>
                </div>
                
                <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Document Title"
                    className="text-xl font-semibold w-full p-2 mb-4 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                />
                
                <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Start writing your content here..."
                    className="flex-1 w-full p-4 mb-4 border border-gray-300 rounded-lg resize-none focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                />

                <div className="flex justify-end space-x-3 pt-4 border-t">
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="px-6 py-3 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition disabled:opacity-50 flex items-center"
                    >
                        {isSaving ? <Loader className="animate-spin mr-2" size={20} /> : <Edit2 className="mr-2" size={20} />}
                        {isSaving ? 'Saving...' : 'Save Changes'}
                    </button>
                    <button
                        onClick={onClose}
                        className="px-6 py-3 bg-gray-300 text-gray-800 font-semibold rounded-lg hover:bg-gray-400 transition"
                    >
                        Cancel
                    </button>
                </div>
                <p className='text-xs text-right mt-2 text-gray-500'>Last Updated: {new Date(document.lastUpdated).toLocaleTimeString()}</p>
            </div>
        </div>
    );
};


// --- Main App Component ---

const App = () => {
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [user, setUser] = useState(null);
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [myDocuments, setMyDocuments] = useState([]);
  const [sharedDocuments, setSharedDocuments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeDocument, setActiveDocument] = useState(null); // Document being edited
  
  const isUserAuthenticated = !!user;

  // 1. Authentication and Initialization
  useEffect(() => {
    if (!auth) {
        setError("Firebase configuration is missing or failed to initialize.");
        setIsAuthReady(true);
        return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      try {
        if (currentUser) {
          setUser(currentUser);
          setUserId(currentUser.uid);
        } else {
          if (initialAuthToken) {
            const cred = await signInWithCustomToken(auth, initialAuthToken);
            setUser(cred.user);
            setUserId(cred.user.uid);
          } else {
            const anonUser = await signInAnonymously(auth);
            setUser(anonUser.user);
            setUserId(anonUser.user.uid);
          }
        }
      } catch (e) {
        console.error("Auth error:", e);
        setError("Failed to authenticate user. Falling back to anonymous ID.");
        // Fallback to a placeholder UUID if all auth fails
        setUserId(crypto.randomUUID());
      } finally {
        setIsAuthReady(true);
      }
    });

    return () => unsubscribe();
  }, []);

  // 2. Data Listeners (My Documents & Shared Documents)
  useEffect(() => {
    if (!isAuthReady || !userId || !db) return;

    // Listener 1: My Private Documents
    const privateRef = getPrivateCollectionRef(userId, 'documents');
    let unsubscribePrivate;
    if (privateRef) {
      unsubscribePrivate = onSnapshot(privateRef, (snapshot) => {
        const docs = snapshot.docs.map(d => ({
          id: d.id,
          ...d.data(),
          isPublic: false, // Mark private docs
        }));
        setMyDocuments(docs.sort((a, b) => b.lastUpdated - a.lastUpdated)); 
      }, (e) => {
        console.error("Firestore private documents error:", e);
        setError("Failed to load your private documents.");
      });
    }

    // Listener 2: Public/Shared Documents
    const publicRef = getPublicCollectionRef('documents');
    let unsubscribePublic;
    if (publicRef) {
        const q = query(publicRef);
        unsubscribePublic = onSnapshot(q, (snapshot) => {
            const docs = snapshot.docs.map(d => ({
                id: d.id,
                ...d.data(),
                isPublic: true, // Mark public docs
            }));
            // Show all public documents, including the user's own public documents
            setSharedDocuments(docs.sort((a, b) => b.lastUpdated - a.lastUpdated));
        }, (e) => {
            console.error("Firestore public documents error:", e);
            setError("Failed to load shared documents.");
        });
    }

    return () => {
      if (unsubscribePrivate) unsubscribePrivate();
      if (unsubscribePublic) unsubscribePublic();
    };
  }, [isAuthReady, userId]);

  // --- CRUD Operations ---

  const createDocument = useCallback(async (title, isPublic = false) => {
    if (!db || !userId) {
        setError("Database not ready or user ID missing.");
        return;
    }
    setLoading(true);
    try {
        const newDoc = {
            title: title || `Untitled Document ${new Date().toLocaleTimeString()}`,
            content: '',
            authorId: userId,
            createdAt: Date.now(),
            lastUpdated: Date.now(),
        };

        let docRef;
        if (isPublic) {
            // Add to public collection
            const ref = getPublicCollectionRef('documents');
            if (ref) docRef = await addDoc(ref, newDoc);
        } else {
            // Add to private collection
            const ref = getPrivateCollectionRef(userId, 'documents');
            if (ref) docRef = await addDoc(ref, newDoc);
        }
        
        setError(`Document '${newDoc.title}' created successfully!`);
        // Immediately open for editing
        if (docRef) {
            setActiveDocument({ id: docRef.id, ...newDoc, isPublic });
        }
    } catch (e) {
        console.error("Error creating document:", e);
        setError("Failed to create document: " + e.message);
    } finally {
        setLoading(false);
    }
  }, [userId]);

  const updateDocument = useCallback(async (docId, data, isPublic) => {
    if (!db || !userId) {
        setError("Database not ready or user ID missing.");
        return;
    }
    setLoading(true);
    try {
        let docRef;
        if (isPublic) {
            docRef = doc(getPublicCollectionRef('documents'), docId);
        } else {
            docRef = doc(getPrivateCollectionRef(userId, 'documents'), docId);
        }
        
        await updateDoc(docRef, { ...data, lastUpdated: Date.now() });
        setError(`Document updated successfully!`);
    } catch (e) {
        console.error("Error updating document:", e);
        setError("Failed to update document. Check permissions or network connection.");
    } finally {
        setLoading(false);
    }
  }, [userId]);

  const deleteDocument = useCallback(async (docId, isPublic, authorId) => {
    if (!db || !userId) {
        setError("Database not ready or user ID missing.");
        return;
    }

    // Custom check for deletion permissions (only author can delete public file)
    if (isPublic && authorId !== userId) {
        setError("You can only delete public documents that you have authored.");
        return;
    }

    // Replaces window.confirm
    if (!window.confirm(`Are you sure you want to delete this document? This cannot be undone.`)) {
        return;
    }

    setLoading(true);
    try {
        let docRef;
        if (isPublic) {
            docRef = doc(getPublicCollectionRef('documents'), docId);
        } else {
            docRef = doc(getPrivateCollectionRef(userId, 'documents'), docId);
        }
        
        await deleteDoc(docRef);
        setError(`Document deleted successfully.`);
    } catch (e) {
        console.error("Error deleting document:", e);
        setError("Failed to delete document: " + e.message);
    } finally {
        setLoading(false);
    }
  }, [userId]);


  // --- UI Handlers and Navigation ---

  const handleSignOut = useCallback(async () => {
    if (!auth) return;
    try {
      await signOut(auth);
      // Clean up state
      setUser(null);
      setUserId(null);
      setMyDocuments([]);
      setSharedDocuments([]);
      setActiveDocument(null);
    } catch (e) {
      console.error("Sign out error:", e);
      setError("Sign out failed.");
    }
  }, []);

  const formatUserId = (id) => id ? `...${id.substring(id.length - 8)}` : 'N/A';

  // --- Sub-Components for Content Rendering ---

  const NewDocumentCreator = () => {
    const [title, setTitle] = useState('');
    const [isPublic, setIsPublic] = useState(false);
    
    const handleSubmit = (e) => {
        e.preventDefault();
        createDocument(title, isPublic);
        setTitle('');
        setIsPublic(false);
    };

    return (
        <form onSubmit={handleSubmit} className="p-6 bg-white rounded-xl shadow-lg border border-blue-100">
            <h2 className="text-xl font-bold mb-4 text-blue-800 flex items-center">
                <PlusCircle className="mr-2 text-blue-600" size={20} /> Create New Document
            </h2>
            <input
                type="text"
                placeholder="Enter document title (e.g., Project Proposal)"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="w-full p-3 mb-4 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 transition"
            />
            <div className="flex items-center mb-6">
                <input
                    id="isPublic"
                    type="checkbox"
                    checked={isPublic}
                    onChange={(e) => setIsPublic(e.target.checked)}
                    className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <label htmlFor="isPublic" className="ml-2 text-sm font-medium text-gray-700">
                    Share publicly (Visible to all users in the Shared list)
                </label>
            </div>
            <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition disabled:opacity-50 flex items-center justify-center"
            >
                {loading ? <Loader className="animate-spin mr-2" size={20} /> : <FileText className="mr-2" size={20} />}
                Create & Edit
            </button>
        </form>
    );
  };

  const DocumentList = ({ title, documents, isPublicList }) => (
    <div className="bg-white rounded-xl shadow-lg overflow-hidden border">
      <h2 className="p-4 text-lg font-semibold text-gray-800 border-b flex items-center bg-gray-50">
        {isPublicList ? <Users className="mr-2 text-green-600" size={20} /> : <FileText className="mr-2 text-blue-600" size={20} />}
        {title} (<span className="text-blue-600 font-extrabold">{documents.length}</span>)
      </h2>
      <div className="max-h-96 overflow-y-auto">
        {documents.length === 0 ? (
          <p className="p-4 text-gray-500 text-sm">No documents found. Start by creating a new one!</p>
        ) : (
          <ul className="divide-y divide-gray-200">
            {documents.map((docItem) => {
                const canDelete = isPublicList ? docItem.authorId === userId : true;
                return (
                    <li key={docItem.id} className="flex justify-between items-center p-4 hover:bg-blue-50 transition duration-150">
                        <div className="flex-1 min-w-0 pr-4">
                            <p className="font-medium text-gray-900 truncate">{docItem.title}</p>
                            <p className="text-sm text-gray-500">
                                {isPublicList && (
                                    <span>Author: {docItem.authorId === userId ? 'You' : formatUserId(docItem.authorId)} | </span>
                                )}
                                Updated: {new Date(docItem.lastUpdated).toLocaleTimeString()}
                            </p>
                        </div>
                        <div className="flex space-x-2 flex-shrink-0">
                            <button 
                                onClick={() => setActiveDocument(docItem)}
                                className="p-2 text-sm text-blue-600 hover:text-white hover:bg-blue-600 bg-blue-100 rounded-full transition shadow-sm"
                                title="Edit Document"
                            >
                                <Edit2 size={16} />
                            </button>
                            {canDelete && (
                                <button 
                                    onClick={() => deleteDocument(docItem.id, isPublicList, docItem.authorId)}
                                    className="p-2 text-sm text-red-600 hover:text-white hover:bg-red-600 bg-red-100 rounded-full transition shadow-sm"
                                    title="Delete Document"
                                >
                                    <Trash size={16} />
                                </button>
                            )}
                        </div>
                    </li>
                );
            })}
          </ul>
        )}
      </div>
    </div>
  );
  
  // --- Main Render Logic ---

  if (!isAuthReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader className="animate-spin text-blue-600" size={32} />
        <p className="ml-3 text-lg text-gray-700">Connecting to the database and authenticating...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      
      {/* Modal for Messages and Errors */}
      <MessageModal message={error} type={error.includes("Failed") || error.includes("error") ? 'error' : 'info'} onClose={() => setError('')} />

      {/* Document Editor Modal */}
      {activeDocument && (
        <DocumentEditor 
            document={activeDocument} 
            onClose={() => setActiveDocument(null)} 
            updateDocument={updateDocument}
        />
      )}

      {/* Header/Navigation */}
      <header className="sticky top-0 bg-white shadow-lg z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-extrabold text-gray-800 flex items-center">
            <FileText className="text-blue-600 mr-2" size={24} />
            Collaborative Dashboard
          </h1>
          <nav className="flex space-x-4 items-center">
            <div className="text-sm font-medium text-gray-600 hidden sm:block">
                User ID: <span className="font-mono text-gray-900">{userId}</span>
            </div>
            
            <button
              onClick={() => setCurrentPage('dashboard')}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition ${
                currentPage === 'dashboard' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-600 hover:bg-gray-100'
              } flex items-center`}
            >
              <Home size={18} className="inline mr-1"/> Dashboard
            </button>

            {isUserAuthenticated && (
                <button
                    onClick={handleSignOut}
                    className="px-4 py-2 text-sm font-medium text-red-600 bg-red-100 rounded-lg hover:bg-red-200 transition flex items-center shadow-sm"
                >
                    <LogOut size={18} className="inline mr-1"/> Sign Out
                </button>
            )}
            
          </nav>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Dashboard View */}
        {currentPage === 'dashboard' && (
          <div className="space-y-8">
            <NewDocumentCreator />
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <DocumentList 
                title="My Private Files" 
                documents={myDocuments} 
                isPublicList={false} 
              />
              <DocumentList 
                title="Shared Public Files" 
                documents={sharedDocuments} 
                isPublicList={true} 
              />
            </div>
            
            <footer className="pt-6 text-center text-sm text-gray-500 border-t mt-8">
                <p>Data stored: Private: `artifacts/{appId}/users/{formatUserId(userId)}/documents` | Public: `artifacts/{appId}/public/data/documents`.</p>
            </footer>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
