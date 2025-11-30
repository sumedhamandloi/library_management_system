// Storage utilities
const Storage = {
	read(key, fallback) {
		try {
			const raw = localStorage.getItem(key);
			return raw ? JSON.parse(raw) : fallback;
		} catch (_) {
			return fallback;
		}
	},
	write(key, value) {
		localStorage.setItem(key, JSON.stringify(value));
	}
};

// Data model
const db = {
	get books() { return Storage.read('lib_books', []); },
	set books(v) { Storage.write('lib_books', v); },
	get borrowers() { return Storage.read('lib_borrowers', []); },
	set borrowers(v) { Storage.write('lib_borrowers', v); },
	get loans() { return Storage.read('lib_loans', []); }, // active loans only
	set loans(v) { Storage.write('lib_loans', v); },
	get logs() { return Storage.read('lib_logs', []); }, // issue/return events
	set logs(v) { Storage.write('lib_logs', v); }
};

// Helpers
const uid = () => Math.random().toString(36).slice(2, 9);
const todayStr = () => new Date().toISOString().slice(0,10);
const addDays = (dateStr, days) => {
	const d = new Date(dateStr);
	d.setDate(d.getDate() + days);
	return d.toISOString().slice(0,10);
};

// Toast
const toastEl = document.getElementById('toast');
function toast(message) {
	toastEl.textContent = message;
	toastEl.classList.remove('hidden');
	clearTimeout(toastEl._t);
	toastEl._t = setTimeout(() => toastEl.classList.add('hidden'), 2000);
}

// Tabs
document.querySelectorAll('.tab').forEach(btn => {
	btn.addEventListener('click', () => {
		document.querySelectorAll('.tab').forEach(b => {
			b.classList.toggle('active', b === btn);
			b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
		});
		document.querySelectorAll('.panel').forEach(p => p.classList.add('hidden'));
		const id = btn.dataset.tab;
		document.getElementById(`panel-${id}`).classList.remove('hidden');
	});
});

// Modal
const modalRoot = document.getElementById('modal-root');
function openModal(title, bodyHTML, actions = []) {
	modalRoot.innerHTML = `
		<div class="modal" role="dialog" aria-modal="true" aria-label="${title}">
			<div class="modal-header">
				<h3>${title}</h3>
				<button class="btn small ghost" id="modal-close">Close</button>
			</div>
			<div class="modal-body">${bodyHTML}</div>
			<div class="modal-actions">
				${actions.map((a, i) => `<button class="btn ${a.class || ''}" data-idx="${i}">${a.label}</button>`).join('')}
			</div>
		</div>
	`;
	modalRoot.classList.remove('hidden');
	modalRoot.setAttribute('aria-hidden', 'false');
	document.getElementById('modal-close').onclick = closeModal;
	modalRoot.querySelectorAll('.modal-actions .btn').forEach(btn => {
		btn.addEventListener('click', () => {
			const idx = +btn.dataset.idx;
			actions[idx]?.onClick?.();
		});
	});
	modalRoot.onclick = e => { if (e.target === modalRoot) closeModal(); };
}
function closeModal() {
	modalRoot.classList.add('hidden');
	modalRoot.setAttribute('aria-hidden', 'true');
	modalRoot.innerHTML = '';
}

// Rendering
function renderBooks(filter = '') {
	const tbody = document.getElementById('books-tbody');
	const books = db.books;
	const loans = db.loans;
	const q = filter.trim().toLowerCase();
	const filtered = q ? books.filter(b =>
		(b.title || '').toLowerCase().includes(q) ||
		(b.author || '').toLowerCase().includes(q) ||
		(b.category || '').toLowerCase().includes(q)
	) : books;
	if (filtered.length === 0) {
		tbody.innerHTML = `<tr class="empty"><td colspan="6">No matching books.</td></tr>`;
		return;
	}
	tbody.innerHTML = filtered.map(b => {
		const isLoaned = loans.some(l => l.bookId === b.id);
		const status = isLoaned ? `<span class="badge warn">Issued</span>` : `<span class="badge success">Available</span>`;
		return `
			<tr>
				<td>${escapeHtml(b.title)}</td>
				<td>${escapeHtml(b.author)}</td>
				<td>${escapeHtml(b.category)}</td>
				<td>${escapeHtml(b.isbn || '')}</td>
				<td>${status}</td>
				<td>
					<div style="display:flex;gap:8px;flex-wrap:wrap">
						<button class="btn small" data-action="edit" data-id="${b.id}">Edit</button>
						<button class="btn small danger" data-action="delete" data-id="${b.id}">Delete</button>
					</div>
				</td>
			</tr>
		`;
	}).join('');
	Array.from(tbody.querySelectorAll('button')).forEach(btn => {
		const id = btn.getAttribute('data-id');
		const action = btn.getAttribute('data-action');
		btn.addEventListener('click', () => {
			if (action === 'edit') showBookForm(db.books.find(b => b.id === id));
			if (action === 'delete') deleteBook(id);
		});
	});
}

function renderBorrowers(filter = '') {
	const tbody = document.getElementById('borrowers-tbody');
	const borrowers = db.borrowers;
	const q = filter.trim().toLowerCase();
	const filtered = q ? borrowers.filter(b =>
		(b.name || '').toLowerCase().includes(q) ||
		(b.email || '').toLowerCase().includes(q)
	) : borrowers;
	if (filtered.length === 0) {
		tbody.innerHTML = `<tr class="empty"><td colspan="5">No matching borrowers.</td></tr>`;
		return;
	}
	tbody.innerHTML = filtered.map(br => {
		const activeLoans = db.loans.filter(l => l.borrowerId === br.id).length;
		return `
			<tr>
				<td>${escapeHtml(br.name)}</td>
				<td>${escapeHtml(br.email)}</td>
				<td>${escapeHtml(br.studentId || '')}</td>
				<td>${activeLoans}</td>
				<td>
					<div style="display:flex;gap:8px;flex-wrap:wrap">
						<button class="btn small" data-action="edit" data-id="${br.id}">Edit</button>
						<button class="btn small danger" data-action="delete" data-id="${br.id}">Delete</button>
					</div>
				</td>
			</tr>
		`;
	}).join('');
	Array.from(tbody.querySelectorAll('button')).forEach(btn => {
		const id = btn.getAttribute('data-id');
		const action = btn.getAttribute('data-action');
		btn.addEventListener('click', () => {
			if (action === 'edit') showBorrowerForm(db.borrowers.find(b => b.id === id));
			if (action === 'delete') deleteBorrower(id);
		});
	});
}

function renderActiveLoans() {
	const tbody = document.getElementById('active-loans-tbody');
	const loans = db.loans;
	if (loans.length === 0) {
		tbody.innerHTML = `<tr class="empty"><td colspan="5">No active loans.</td></tr>`;
		return;
	}
	const booksMap = Object.fromEntries(db.books.map(b => [b.id, b]));
	const borrowersMap = Object.fromEntries(db.borrowers.map(b => [b.id, b]));
	tbody.innerHTML = loans.map(l => {
		const b = booksMap[l.bookId];
		const br = borrowersMap[l.borrowerId];
		return `
			<tr>
				<td>${escapeHtml(b?.title || 'Unknown')}</td>
				<td>${escapeHtml(br?.name || 'Unknown')}</td>
				<td>${escapeHtml(l.issuedOn)}</td>
				<td>${escapeHtml(l.dueOn)}</td>
				<td>
					<button class="btn small" data-action="return" data-id="${l.id}">Mark Returned</button>
				</td>
			</tr>
		`;
	}).join('');
	Array.from(tbody.querySelectorAll('button')).forEach(btn => {
		const id = btn.getAttribute('data-id');
		btn.addEventListener('click', () => returnLoan(id));
	});
}

function renderLogs() {
	const tbody = document.getElementById('logs-tbody');
	const logs = db.logs.slice().reverse(); // latest first
	if (logs.length === 0) {
		tbody.innerHTML = `<tr class="empty"><td colspan="4">No logs yet.</td></tr>`;
		return;
	}
	const booksMap = Object.fromEntries(db.books.map(b => [b.id, b]));
	const borrowersMap = Object.fromEntries(db.borrowers.map(b => [b.id, b]));
	tbody.innerHTML = logs.map(item => {
		const b = booksMap[item.bookId];
		const br = borrowersMap[item.borrowerId];
		const action = item.type === 'issue' ? 'Issued' : 'Returned';
		return `
			<tr>
				<td>${escapeHtml(b?.title || 'Unknown')}</td>
				<td>${escapeHtml(br?.name || 'Unknown')}</td>
				<td>${action}</td>
				<td>${escapeHtml(item.date)}</td>
			</tr>
		`;
	}).join('');
}

// CRUD: Books
function showBookForm(existing) {
	const isEdit = !!existing;
	openModal(isEdit ? 'Edit Book' : 'Add Book', `
		<div class="field">
			<label class="label" for="f-title">Title</label>
			<input id="f-title" class="input" placeholder="e.g. Introduction to Algorithms" value="${escapeAttr(existing?.title || '')}">
		</div>
		<div class="field">
			<label class="label" for="f-author">Author</label>
			<input id="f-author" class="input" placeholder="e.g. Cormen et al." value="${escapeAttr(existing?.author || '')}">
		</div>
		<div class="field">
			<label class="label" for="f-category">Category</label>
			<input id="f-category" class="input" placeholder="e.g. Computer Science" value="${escapeAttr(existing?.category || '')}">
		</div>
		<div class="field">
			<label class="label" for="f-isbn">ISBN</label>
			<input id="f-isbn" class="input" placeholder="Optional" value="${escapeAttr(existing?.isbn || '')}">
		</div>
		<p class="help">All fields except ISBN are required.</p>
	`, [
		{ label: 'Cancel', class: 'ghost', onClick: closeModal },
		{ label: isEdit ? 'Save' : 'Add Book', class: 'primary', onClick: () => {
			const title = val('#f-title').trim();
			const author = val('#f-author').trim();
			const category = val('#f-category').trim();
			const isbn = val('#f-isbn').trim();
			if (!title || !author || !category) {
				toast('Please fill required fields.');
				return;
			}
			if (isEdit) {
				const books = db.books.map(b => b.id === existing.id ? { ...b, title, author, category, isbn } : b);
				db.books = books;
				toast('Book updated.');
			} else {
				const book = { id: uid(), title, author, category, isbn };
				db.books = [...db.books, book];
				toast('Book added.');
			}
			closeModal();
			renderBooks(document.getElementById('book-search').value);
			renderActiveLoans();
			renderLogs();
		}}
	]);
}

function deleteBook(id) {
	const isLoaned = db.loans.some(l => l.bookId === id);
	if (isLoaned) {
		toast('Cannot delete: book currently issued.');
		return;
	}
	openConfirm('Delete this book?', () => {
		db.books = db.books.filter(b => b.id !== id);
		renderBooks(document.getElementById('book-search').value);
		toast('Book deleted.');
	});
}

// CRUD: Borrowers
function showBorrowerForm(existing) {
	const isEdit = !!existing;
	openModal(isEdit ? 'Edit Borrower' : 'Add Borrower', `
		<div class="field">
			<label class="label" for="p-name">Name</label>
			<input id="p-name" class="input" placeholder="e.g. Jane Doe" value="${escapeAttr(existing?.name || '')}">
		</div>
		<div class="field">
			<label class="label" for="p-email">Email</label>
			<input id="p-email" class="input" placeholder="e.g. jane@university.edu" value="${escapeAttr(existing?.email || '')}">
		</div>
		<div class="field">
			<label class="label" for="p-id">Student ID</label>
			<input id="p-id" class="input" placeholder="e.g. U123456" value="${escapeAttr(existing?.studentId || '')}">
		</div>
		<div class="field">
			<label class="label" for="p-book">Book Borrowed</label>
			<input id="p-book" class="input" placeholder="Optional (e.g. 1984 by George Orwell)" value="${escapeAttr(existing?.bookBorrowed || '')}">
		</div>
		<p class="help">Name, Email, and Student ID are required. Book Borrowed is optional.</p>
	`, [
		{ label: 'Cancel', class: 'ghost', onClick: closeModal },
		{ label: isEdit ? 'Save' : 'Add Borrower', class: 'primary', onClick: () => {
			const name = val('#p-name').trim();
			const email = val('#p-email').trim();
			const studentId = val('#p-id').trim();
			const bookBorrowed = val('#p-book').trim();
			if (!name || !email || !studentId) {
				toast('Please fill required fields.');
				return;
			}
			if (isEdit) {
				db.borrowers = db.borrowers.map(b => b.id === existing.id ? { ...b, name, email, studentId, bookBorrowed } : b);
				toast('Borrower updated.');
			} else {
				const br = { id: uid(), name, email, studentId, bookBorrowed };
				db.borrowers = [...db.borrowers, br];
				toast('Borrower added.');
			}
			closeModal();
			renderBorrowers(document.getElementById('borrower-search').value);
			renderActiveLoans();
			renderLogs();
		}}
	]);
}

function deleteBorrower(id) {
	const hasActive = db.loans.some(l => l.borrowerId === id);
	if (hasActive) {
		toast('Cannot delete: borrower has active loans.');
		return;
	}
	openConfirm('Delete this borrower?', () => {
		db.borrowers = db.borrowers.filter(b => b.id !== id);
		renderBorrowers(document.getElementById('borrower-search').value);
		toast('Borrower deleted.');
	});
}

// Issue/Return
function showIssueForm() {
	if (db.books.length === 0 || db.borrowers.length === 0) {
		toast('Add at least one book and one borrower first.');
		return;
	}
	const availableBooks = db.books.filter(b => !db.loans.some(l => l.bookId === b.id));
	if (availableBooks.length === 0) {
		toast('No available books to issue.');
		return;
	}
	openModal('Issue Book', `
		<div class="field">
			<label class="label" for="i-book">Book</label>
			<select id="i-book" class="select">
				${availableBooks.map(b => `<option value="${b.id}">${escapeHtml(b.title)} — ${escapeHtml(b.author)}</option>`).join('')}
			</select>
		</div>
		<div class="field">
			<label class="label" for="i-borrower">Borrower</label>
			<select id="i-borrower" class="select">
				${db.borrowers.map(br => `<option value="${br.id}">${escapeHtml(br.name)} (${escapeHtml(br.studentId)})</option>`).join('')}
			</select>
		</div>
		<div class="field">
			<label class="label" for="i-date">Issue Date</label>
			<input id="i-date" type="date" class="input" value="${todayStr()}">
		</div>
		<div class="field">
			<label class="label" for="i-due">Due Date</label>
			<input id="i-due" type="date" class="input" value="${addDays(todayStr(), 14)}">
		</div>
	`, [
		{ label: 'Cancel', class: 'ghost', onClick: closeModal },
		{ label: 'Issue', class: 'primary', onClick: () => {
			const bookId = val('#i-book');
			const borrowerId = val('#i-borrower');
			const issuedOn = val('#i-date');
			const dueOn = val('#i-due');
			if (!bookId || !borrowerId || !issuedOn || !dueOn) {
				toast('Please fill all fields.');
				return;
			}
			const loan = { id: uid(), bookId, borrowerId, issuedOn, dueOn };
			db.loans = [...db.loans, loan];
			db.logs = [...db.logs, { type: 'issue', date: todayStr(), bookId, borrowerId }];
			closeModal();
			renderBooks(document.getElementById('book-search').value);
			renderActiveLoans();
			renderLogs();
			toast('Book issued.');
		}}
	]);
}

function returnLoan(loanId) {
	const loan = db.loans.find(l => l.id === loanId);
	if (!loan) return;
	openConfirm('Mark this book as returned?', () => {
		db.loans = db.loans.filter(l => l.id !== loanId);
		db.logs = [...db.logs, { type: 'return', date: todayStr(), bookId: loan.bookId, borrowerId: loan.borrowerId }];
		renderBooks(document.getElementById('book-search').value);
		renderActiveLoans();
		renderLogs();
		toast('Book returned.');
	});
}

// Search handlers
document.getElementById('book-search').addEventListener('input', e => renderBooks(e.target.value));
document.getElementById('borrower-search').addEventListener('input', e => renderBorrowers(e.target.value));

// Buttons
document.getElementById('btn-add-book').addEventListener('click', () => showBookForm());
document.getElementById('btn-add-borrower').addEventListener('click', () => showBorrowerForm());
document.getElementById('btn-issue').addEventListener('click', () => showIssueForm());

// Confirm helper
function openConfirm(message, onYes) {
	openModal('Confirm', `
		<p>${escapeHtml(message)}</p>
	`, [
		{ label: 'Cancel', class: 'ghost', onClick: closeModal },
		{ label: 'Yes', class: 'primary', onClick: () => { closeModal(); onYes?.(); } }
	]);
}

// Utils
function val(sel) { return document.querySelector(sel).value; }
function escapeHtml(s) {
	return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}
function escapeAttr(s) {
	return escapeHtml(s).replace(/"/g, '&quot;');
}

// Seed sample data if empty
function seed() {
	const requestedBooks = [
		{ title: 'The Great Gatsby', author: 'F. Scott Fitzgerald', category: 'Fiction' },
		{ title: 'To Kill a Mockingbird', author: 'Harper Lee', category: 'Fiction' },
		{ title: '1984', author: 'George Orwell', category: 'Fiction' },
		{ title: 'Pride and Prejudice', author: 'Jane Austen', category: 'Fiction' },
		{ title: 'The Catcher in the Rye', author: 'J.D. Salinger', category: 'Fiction' },
		{ title: 'Lord of the Flies', author: 'William Golding', category: 'Fiction' },
		{ title: 'Brave New World', author: 'Aldous Huxley', category: 'Fiction' },
		{ title: 'The Hobbit', author: 'J.R.R. Tolkien', category: 'Fiction' },
		{ title: 'Animal Farm', author: 'George Orwell', category: 'Fiction' },
		{ title: 'The Lord of the Rings', author: 'J.R.R. Tolkien', category: 'Fiction' },
		{ title: 'Jane Eyre', author: 'Charlotte Brontë', category: 'Fiction' },
		{ title: 'Wuthering Heights', author: 'Emily Brontë', category: 'Fiction' },
		{ title: 'The Odyssey', author: 'Homer', category: 'Classics' },
		{ title: 'Introduction to Algorithms', author: 'Cormen et al.', category: 'Computer Science' },
		{ title: 'Clean Code', author: 'Robert C. Martin', category: 'Software' },
		{ title: 'The Lean Startup', author: 'Eric Ries', category: 'Business' },
		{ title: 'Database Systems', author: 'Elmasri & Navathe', category: 'Computer Science' },
		{ title: 'Business Analysis', author: 'Steven P. Blais', category: 'Business' },
		{ title: 'Software Engineering', author: 'Roger S. Pressman', category: 'Software' },
		{ title: 'Network Security', author: 'William Stallings', category: 'Computer Science' }
	];
	// If empty, seed a base set first
	if (db.books.length === 0) {
		db.books = requestedBooks.map(b => ({ id: uid(), ...b, isbn: '' }));
	} else {
		// Ensure all requested books exist; add missing by title (case-insensitive)
		const existingTitles = new Set(db.books.map(b => (b.title || '').toLowerCase()));
		const toAdd = requestedBooks.filter(b => !existingTitles.has(b.title.toLowerCase()))
			.map(b => ({ id: uid(), ...b, isbn: '' }));
		if (toAdd.length) db.books = [...db.books, ...toAdd];
	}
	if (db.borrowers.length === 0) {
		db.borrowers = [
			{ id: uid(), name: 'Ramesh Kumar', email: 'rameshkumar@university.edu', studentId: 'U2023001' },
			{ id: uid(), name: 'Pooja Bhatt', email: 'pbhatt@university.edu', studentId: 'U2023002' }
		];
	}
}

// Initial render
seed();
renderBooks();
renderBorrowers();
renderActiveLoans();
renderLogs();


