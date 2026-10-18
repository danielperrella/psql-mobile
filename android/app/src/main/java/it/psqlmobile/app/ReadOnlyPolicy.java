package it.psqlmobile.app;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/** Conservative SQL gate used with PostgreSQL read-only transactions as a second layer. */
final class ReadOnlyPolicy {
    private static final Set<String> READ_ROOTS = new HashSet<>(Arrays.asList(
        "SELECT", "WITH", "VALUES", "TABLE", "SHOW", "EXPLAIN"
    ));
    private static final Set<String> BLOCKED = new HashSet<>(Arrays.asList(
        "INSERT", "UPDATE", "DELETE", "MERGE", "UPSERT", "COPY", "CALL", "DO",
        "CREATE", "ALTER", "DROP", "TRUNCATE", "COMMENT", "GRANT", "REVOKE",
        "REFRESH", "REINDEX", "VACUUM", "ANALYZE", "CLUSTER", "DISCARD",
        "SET", "RESET", "BEGIN", "START", "COMMIT", "END", "ROLLBACK", "ABORT",
        "SAVEPOINT", "RELEASE", "PREPARE", "EXECUTE", "DEALLOCATE", "LOCK", "FOR",
        "INTO", "SET_CONFIG", "NEXTVAL", "SETVAL", "PG_NOTIFY", "PG_ADVISORY_LOCK",
        "DBLINK", "PG_CANCEL_BACKEND", "PG_TERMINATE_BACKEND", "PG_RELOAD_CONF",
        "PG_ROTATE_LOGFILE", "PG_PROMOTE", "PG_CREATE_RESTORE_POINT"
    ));

    private ReadOnlyPolicy() { }

    static void requireReadOnlySql(String sql) {
        for (List<String> statement : statements(sql)) {
            if (statement.isEmpty()) continue;
            String root = statement.get(0);
            if (!READ_ROOTS.contains(root)) reject();
            for (String word : statement) {
                if (BLOCKED.contains(word) || word.startsWith("DBLINK_")
                        || word.startsWith("PG_ADVISORY_") || word.startsWith("LO_")) reject();
            }
            if (root.equals("EXPLAIN") && statement.contains("ANALYZE")) reject();
        }
    }

    private static void reject() {
        throw new IllegalArgumentException("In sola lettura sono consentite solo query di lettura (SELECT, WITH, VALUES, TABLE, SHOW ed EXPLAIN senza ANALYZE). Comandi di modifica, transazione o impostazione non sono consentiti.");
    }

    /** Tokenizes enough SQL structure to ignore comments and quoted strings while splitting scripts. */
    private static List<List<String>> statements(String sql) {
        List<List<String>> statements = new ArrayList<>();
        List<String> current = new ArrayList<>();
        int i=0, length=sql.length();
        while (i<length) {
            char c=sql.charAt(i);
            if (Character.isWhitespace(c)) { i++; continue; }
            if (c=='-' && i+1<length && sql.charAt(i+1)=='-') {
                i+=2; while(i<length&&sql.charAt(i)!='\n'&&sql.charAt(i)!='\r')i++; continue;
            }
            if (c=='/' && i+1<length && sql.charAt(i+1)=='*') {
                i+=2; int depth=1;
                while(i<length&&depth>0) {
                    if(i+1<length&&sql.charAt(i)=='/'&&sql.charAt(i+1)=='*'){depth++;i+=2;}
                    else if(i+1<length&&sql.charAt(i)=='*'&&sql.charAt(i+1)=='/'){depth--;i+=2;}
                    else i++;
                }
                continue;
            }
            if (c=='\'' || c=='"') {
                char quote=c; StringBuilder identifier=new StringBuilder();
                boolean escapeString=quote=='\''&&i>0&&(sql.charAt(i-1)=='e'||sql.charAt(i-1)=='E')
                    &&(i<2||!(Character.isLetterOrDigit(sql.charAt(i-2))||sql.charAt(i-2)=='_'||sql.charAt(i-2)=='$'));
                i++;
                while(i<length) {
                    if(sql.charAt(i)==quote) {
                        if(i+1<length&&sql.charAt(i+1)==quote){if(quote=='"')identifier.append(quote);i+=2;continue;}
                        i++;break;
                    }
                    if(quote=='"')identifier.append(sql.charAt(i));
                    if(escapeString&&sql.charAt(i)=='\\'&&i+1<length)i+=2;else i++;
                }
                if(quote=='"'&&identifier.toString().matches("[A-Za-z_][A-Za-z0-9_$]*"))
                    current.add(identifier.toString().toUpperCase(Locale.ROOT));
                continue;
            }
            if(c=='$') {
                int end=i+1; while(end<length&&(Character.isLetterOrDigit(sql.charAt(end))||sql.charAt(end)=='_'))end++;
                if(end<length&&sql.charAt(end)=='$') {
                    String delimiter=sql.substring(i,end+1); int close=sql.indexOf(delimiter,end+1);
                    i=close<0?length:close+delimiter.length(); continue;
                }
            }
            if(Character.isLetter(c)||c=='_') {
                int start=i++; while(i<length&&(Character.isLetterOrDigit(sql.charAt(i))||sql.charAt(i)=='_'||sql.charAt(i)=='$'))i++;
                current.add(sql.substring(start,i).toUpperCase(Locale.ROOT)); continue;
            }
            if(c==';') { if(!current.isEmpty()){statements.add(current);current=new ArrayList<>();} i++; continue; }
            i++;
        }
        if(!current.isEmpty())statements.add(current);
        return statements;
    }
}
